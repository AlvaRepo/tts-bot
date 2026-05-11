// Process resilience module for graceful shutdown and health monitoring

/**
 * Creates a resilience object that manages process lifecycle, health signals, and graceful shutdown
 * @param {Object} options - Dependencies for the resilience system
 * @param {import('http').Server} options.server - HTTP server instance
 * @param {import('ws').WebSocketServer} options.wss - WebSocket server instance
 * @param {Object} options.kickBotRunner - Kick bot runner instance with start/stop methods
 * @param {Object} options.queue - Queue instance with control/drain methods
 * @param {Object} options.logger - Logger instance (defaults to console)
 * @returns {Object} Resilience object with health/ready helpers and shutdown method
 */
export function createResilience({ server, wss, kickBotRunner, queue, bootStatus = {}, exitProcess = code => process.exit(code), logger = console }) {
  let shuttingDown = false;
  const startTime = Date.now();

  const isBootReady = () => bootStatus.hydrated === true && !bootStatus.error;
  const onUnhandledRejection = (reason, promise) => {
    logger.error('[resilience] Unhandled Rejection at:', promise, 'reason:', reason);
    if (!shuttingDown) {
      shuttingDown = true;
      shutdown(1).catch(finalError => {
        logger.error('[resilience] Error during shutdown after unhandled rejection:', finalError);
        exitProcess(1);
      });
    }
  };

  const onUncaughtException = (error) => {
    logger.error('[resilience] Uncaught Exception:', error);
    logger.error('[resilience] Stack trace:', error.stack);
    if (!shuttingDown) {
      shuttingDown = true;
      shutdown(1).catch(finalError => {
        logger.error('[resilience] Error during shutdown after uncaught exception:', finalError);
        exitProcess(1);
      });
    }
  };

  const onSigterm = () => {
    logger.info('[resilience] SIGTERM received, initiating graceful shutdown');
    if (!shuttingDown) {
      shuttingDown = true;
      shutdown(0);
    }
  };

  const onSigint = () => {
    logger.info('[resilience] SIGINT received, initiating graceful shutdown');
    if (!shuttingDown) {
      shuttingDown = true;
      shutdown(0);
    }
  };

  const removeListeners = () => {
    process.off('unhandledRejection', onUnhandledRejection);
    process.off('uncaughtException', onUncaughtException);
    process.off('SIGTERM', onSigterm);
    process.off('SIGINT', onSigint);
  };

  // Global error handlers
  process.on('unhandledRejection', onUnhandledRejection);
  process.on('uncaughtException', onUncaughtException);

  // OS signal handlers for graceful shutdown
  const setupSignalHandlers = () => {
    process.on('SIGTERM', onSigterm);
    process.on('SIGINT', onSigint);
  };

  // Shutdown orchestrator
  const shutdown = async (exitCode = 0) => {
    logger.info('[resilience] Shutdown initiated');
    let forcedExit = null;

    try {
      forcedExit = setTimeout(() => {
        logger.warn('[resilience] Force exiting after timeout');
        exitProcess(exitCode || 1);
      }, 30000);
      forcedExit.unref?.();

      // 1. Stop accepting new work (already handled by signal prevention)
      
      // 2. Drain queue (stop accepting new jobs, process existing)
      logger.info('[resilience] Draining queue');
      if (queue && typeof queue.control === 'function') {
        queue.control('pause'); // Pause queue to stop accepting new jobs
        // Wait for current processing to complete (could be enhanced with drain detection)
        await new Promise(resolve => setTimeout(resolve, 1000)); // Simple delay for now
      }

      // 3. Stop bot runner
      logger.info('[resilience] Stopping bot runner');
      if (kickBotRunner && typeof kickBotRunner.stop === 'function') {
        await kickBotRunner.stop();
      }

      // 4. Close WebSocket server
      logger.info('[resilience] Closing WebSocket server');
      if (wss) {
        await new Promise((resolve, reject) => {
          wss.close((err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }

      // 5. Close HTTP server
      logger.info('[resilience] Closing HTTP server');
      if (server) {
        await new Promise((resolve, reject) => {
          server.close((err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }

      logger.info('[resilience] Graceful shutdown completed');
    } catch (error) {
      logger.error('[resilience] Error during shutdown:', error);
      // Continue with force exit
    }

    if (forcedExit) clearTimeout(forcedExit);
    removeListeners();
    exitProcess(exitCode);
  };

  // Health helper - basic liveness
  const health = () => ({
    status: shuttingDown ? 'shuttingdown' : 'ok',
    uptime: Date.now() - startTime
  });

  // Ready helper - checks if bot is connected and services are ready
  const ready = () => {
    const isBotConnected = kickBotRunner && 
      typeof kickBotRunner.isStarted === 'function' && 
      kickBotRunner.isStarted();
    
    return {
      status: shuttingDown ? 'shuttingdown' : (isBootReady() ? 'ok' : 'degraded'),
      connected: !!isBotConnected,
      hydrated: !!bootStatus.hydrated,
      bootError: bootStatus.error ?? null,
      uptime: Date.now() - startTime
    };
  };

  // Setup signal handlers
  setupSignalHandlers();

  return {
    health,
    ready,
    shutdown
  };
}
