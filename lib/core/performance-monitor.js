import logger from './logger.js';

class PerformanceMonitor {
  constructor() {
    this.logger = logger.setContext('PerformanceMonitor');
    this.metrics = new Map();
  }

  startTimer(operationName) {
    this.metrics.set(operationName, {
      startTime: process.hrtime.bigint(),
      startMemory: process.memoryUsage(),
      name: operationName
    });
  }

  endTimer(operationName) {
    const metric = this.metrics.get(operationName);
    if (!metric) {
      this.logger.warn(`No timer found for operation: ${operationName}`);
      return null;
    }

    const endTime = process.hrtime.bigint();
    const endMemory = process.memoryUsage();
    
    const duration = Number(endTime - metric.startTime) / 1000000; // Convert to milliseconds
    const memoryDelta = {
      rss: endMemory.rss - metric.startMemory.rss,
      heapUsed: endMemory.heapUsed - metric.startMemory.heapUsed,
      heapTotal: endMemory.heapTotal - metric.startMemory.heapTotal,
      external: endMemory.external - metric.startMemory.external
    };

    const result = {
      operation: operationName,
      duration: Math.round(duration * 100) / 100, // Round to 2 decimal places
      durationFormatted: this.formatDuration(duration),
      memoryDelta,
      finalMemory: endMemory
    };

    this.logger.info(`Performance: ${operationName}`, {
      duration: result.durationFormatted,
      heapUsedDelta: this.formatBytes(memoryDelta.heapUsed),
      finalHeapUsed: this.formatBytes(endMemory.heapUsed)
    });

    // Clean up
    this.metrics.delete(operationName);
    
    return result;
  }

  formatDuration(milliseconds) {
    if (milliseconds < 1000) {
      return `${Math.round(milliseconds)}ms`;
    } else if (milliseconds < 60000) {
      return `${Math.round(milliseconds / 1000 * 10) / 10}s`;
    } else {
      const minutes = Math.floor(milliseconds / 60000);
      const seconds = Math.round((milliseconds % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
    
    const value = bytes / Math.pow(k, i);
    const sign = bytes < 0 ? '-' : '+';
    
    return `${sign}${Math.round(value * 10) / 10} ${sizes[i]}`;
  }

  getCurrentMemoryUsage() {
    const usage = process.memoryUsage();
    return {
      rss: this.formatBytes(usage.rss),
      heapUsed: this.formatBytes(usage.heapUsed),
      heapTotal: this.formatBytes(usage.heapTotal),
      external: this.formatBytes(usage.external)
    };
  }

  logMemoryUsage(context = 'Memory usage') {
    const usage = this.getCurrentMemoryUsage();
    this.logger.info(context, usage);
  }

  checkMemoryPressure() {
    const usage = process.memoryUsage();
    const heapUsedPercent = (usage.heapUsed / usage.heapTotal) * 100;
    
    if (heapUsedPercent > 90) {
      this.logger.warn('High memory usage detected', {
        heapUsedPercent: Math.round(heapUsedPercent),
        heapUsed: this.formatBytes(usage.heapUsed),
        heapTotal: this.formatBytes(usage.heapTotal)
      });
      
      // Suggest garbage collection if available
      if (global.gc) {
        this.logger.info('Triggering garbage collection');
        global.gc();
      }
      
      return true;
    }
    
    return false;
  }

  withTimer(operationName, asyncFunction) {
    return async (...args) => {
      this.startTimer(operationName);
      try {
        const result = await asyncFunction(...args);
        this.endTimer(operationName);
        return result;
      } catch (error) {
        this.endTimer(operationName);
        throw error;
      }
    };
  }
}

export default new PerformanceMonitor();