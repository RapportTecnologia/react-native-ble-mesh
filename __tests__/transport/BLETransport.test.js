'use strict';

const BLETransport = require('../../src/transport/BLETransport');
const Transport = require('../../src/transport/Transport');
const { BLUETOOTH_STATE } = require('../../src/constants');

// Mock BLE adapter
function createMockAdapter(overrides = {}) {
  return {
    initialize: jest.fn().mockResolvedValue(undefined),
    getState: jest.fn().mockResolvedValue(BLUETOOTH_STATE.POWERED_ON),
    onStateChange: jest.fn(),
    startScan: jest.fn().mockResolvedValue(undefined),
    stopScan: jest.fn(),
    connect: jest.fn().mockResolvedValue({ id: 'device-1', name: 'Test', rssi: -50 }),
    disconnect: jest.fn().mockResolvedValue(undefined),
    write: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('BLETransport', () => {
  let adapter;
  let transport;

  beforeEach(() => {
    adapter = createMockAdapter();
    transport = new BLETransport(adapter);
  });

  afterEach(async () => {
    try { await transport.stop(); } catch (e) { /* ignore */ }
  });

  describe('constructor', () => {
    it('requires an adapter', () => {
      expect(() => new BLETransport()).toThrow('BLE adapter is required');
    });

    it('accepts options', () => {
      const t = new BLETransport(adapter, { maxPeers: 4, connectTimeoutMs: 5000 });
      expect(t).toBeDefined();
    });
  });

  describe('start()', () => {
    it('initializes adapter and checks state', async () => {
      await transport.start();
      expect(adapter.initialize).toHaveBeenCalled();
      expect(adapter.getState).toHaveBeenCalled();
      expect(transport.isRunning).toBe(true);
    });

    it('throws if bluetooth is not powered on', async () => {
      adapter.getState.mockResolvedValue(BLUETOOTH_STATE.POWERED_OFF);
      await expect(transport.start()).rejects.toThrow();
    });

    it('is idempotent when already running', async () => {
      await transport.start();
      await transport.start(); // should not throw
      expect(adapter.initialize).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop()', () => {
    it('stops scanning and disconnects all peers', async () => {
      await transport.start();
      await transport.startScanning();
      await transport.connectToPeer('peer-1');
      await transport.stop();
      expect(adapter.stopScan).toHaveBeenCalled();
      expect(adapter.disconnect).toHaveBeenCalledWith('peer-1');
    });

    it('is idempotent when already stopped', async () => {
      await transport.stop();
      await transport.stop(); // should not throw
    });
  });

  describe('scanning', () => {
    it('starts and stops scanning', async () => {
      await transport.start();
      // start() auto-starts scanning
      expect(transport.isScanning).toBe(true);
      transport.stopScanning();
      expect(transport.isScanning).toBe(false);
    });

    it('does not scan when not running', async () => {
      await transport.startScanning();
      expect(transport.isScanning).toBe(false);
    });

    it('emits scanStarted and scanStopped', async () => {
      const started = jest.fn();
      const stopped = jest.fn();
      transport.on('scanStarted', started);
      transport.on('scanStopped', stopped);

      // start() auto-starts scanning
      await transport.start();
      expect(started).toHaveBeenCalled();

      transport.stopScanning();
      expect(stopped).toHaveBeenCalled();
    });
  });

  describe('connectToPeer()', () => {
    it('connects and subscribes to notifications', async () => {
      await transport.start();
      await transport.connectToPeer('peer-1');
      expect(adapter.connect).toHaveBeenCalledWith('peer-1');
      expect(adapter.subscribe).toHaveBeenCalled();
    });

    it('throws when not running', async () => {
      await expect(transport.connectToPeer('peer-1')).rejects.toThrow('not running');
    });

    it('throws on duplicate connection', async () => {
      await transport.start();
      await transport.connectToPeer('peer-1');
      await expect(transport.connectToPeer('peer-1')).rejects.toThrow();
    });

    it('emits peerConnected event', async () => {
      await transport.start();
      const handler = jest.fn();
      transport.on('peerConnected', handler);
      await transport.connectToPeer('peer-1');
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ peerId: 'peer-1' }));
    });

    it('handles connection timeout', async () => {
      const slowAdapter = createMockAdapter({
        connect: jest.fn(() => new Promise(() => {})), // never resolves
      });
      const t = new BLETransport(slowAdapter, { connectTimeoutMs: 50 });
      await t.start();
      await expect(t.connectToPeer('peer-1')).rejects.toThrow('timed out');
      await t.stop();
    });
  });

  describe('disconnectFromPeer()', () => {
    it('disconnects a connected peer', async () => {
      await transport.start();
      await transport.connectToPeer('peer-1');
      await transport.disconnectFromPeer('peer-1');
      expect(adapter.disconnect).toHaveBeenCalledWith('peer-1');
    });

    it('is safe for unknown peer', async () => {
      await transport.start();
      await transport.disconnectFromPeer('unknown'); // should not throw
    });
  });

  describe('send()', () => {
    it('sends data to a connected peer', async () => {
      await transport.start();
      await transport.connectToPeer('peer-1');
      const data = new Uint8Array([1, 2, 3]);
      await transport.send('peer-1', data);
      expect(adapter.write).toHaveBeenCalled();
    });

    it('throws for unconnected peer', async () => {
      await transport.start();
      await expect(transport.send('unknown', new Uint8Array([1]))).rejects.toThrow();
    });

    it('throws when not running', async () => {
      await expect(transport.send('peer-1', new Uint8Array([1]))).rejects.toThrow('not running');
    });
  });

  describe('broadcast()', () => {
    it('sends to all connected peers', async () => {
      await transport.start();
      await transport.connectToPeer('peer-1');
      adapter.connect.mockResolvedValue({ id: 'peer-2', name: 'Test2', rssi: -60 });
      await transport.connectToPeer('peer-2');
      const data = new Uint8Array([1, 2, 3]);
      const results = await transport.broadcast(data);
      expect(results).toHaveLength(2);
    });

    it('throws when not running', async () => {
      await expect(transport.broadcast(new Uint8Array([1]))).rejects.toThrow('not running');
    });
  });

  describe('power mode', () => {
    it('sets power mode', async () => {
      transport.setPowerMode('PERFORMANCE');
      // No assertion needed — just no throw
      transport.setPowerMode('POWER_SAVER');
    });
  });

  describe('peripheral mode', () => {
    it('starts the peripheral GATT server during start()', async () => {
      const adapterWithPeripheral = createMockAdapter({
        startPeripheral: jest.fn().mockResolvedValue(undefined)
      });
      const t = new BLETransport(adapterWithPeripheral);
      await t.start();
      expect(adapterWithPeripheral.startPeripheral).toHaveBeenCalledWith(expect.objectContaining({
        serviceUuid: '6E400001-B5A3-F393-E0A9-E50E24DCCA9E',
        txCharUuid: '6E400002-B5A3-F393-E0A9-E50E24DCCA9E',
        rxCharUuid: '6E400003-B5A3-F393-E0A9-E50E24DCCA9E'
      }));
      await t.stop();
    });

    it('emits peerConnected for a peripheral-side central', async () => {
      const adapterWithPeripheral = createMockAdapter({
        startPeripheral: jest.fn().mockResolvedValue(undefined),
        onPeripheralCentralConnected: jest.fn((cb) => { adapterWithPeripheral._peripheralConnectedCb = cb; return { remove: jest.fn() }; })
      });
      const t = new BLETransport(adapterWithPeripheral);
      const handler = jest.fn();
      t.on('peerConnected', handler);
      await t.start();
      adapterWithPeripheral._peripheralConnectedCb('peer-2');
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ peerId: 'peer-2' }));
      await t.stop();
    });

    it('routes peripheral writes as messages', async () => {
      const adapterWithPeripheral = createMockAdapter({
        startPeripheral: jest.fn().mockResolvedValue(undefined),
        onPeripheralWrite: jest.fn((cb) => { adapterWithPeripheral._peripheralWriteCb = cb; return { remove: jest.fn() }; })
      });
      const t = new BLETransport(adapterWithPeripheral);
      const handler = jest.fn();
      t.on('message', handler);
      await t.start();
      adapterWithPeripheral._peripheralWriteCb({ deviceId: 'peer-3', data: new Uint8Array([4, 5, 6]) });
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ peerId: 'peer-3' }));
      await t.stop();
    });

    it('sends notifications to peripheral peers', async () => {
      const adapterWithPeripheral = createMockAdapter({
        startPeripheral: jest.fn().mockResolvedValue(undefined),
        onPeripheralCentralConnected: jest.fn((cb) => { adapterWithPeripheral._peripheralConnectedCb = cb; return { remove: jest.fn() }; }),
        notifyPeripheralCharacteristic: jest.fn().mockResolvedValue(undefined)
      });
      const t = new BLETransport(adapterWithPeripheral);
      await t.start();
      adapterWithPeripheral._peripheralConnectedCb('peer-4');
      const data = new Uint8Array([7, 8, 9]);
      await t.send('peer-4', data);
      expect(adapterWithPeripheral.notifyPeripheralCharacteristic).toHaveBeenCalledWith(
        'peer-4',
        '6E400001-B5A3-F393-E0A9-E50E24DCCA9E',
        '6E400003-B5A3-F393-E0A9-E50E24DCCA9E',
        data
      );
      await t.stop();
    });
  });

  describe('auto-connect', () => {
    it('connects to a discovered device when autoConnect is enabled', async () => {
      const scanAdapter = createMockAdapter({
        startScan: jest.fn((_, cb) => { scanAdapter._scanCb = cb; })
      });
      const t = new BLETransport(scanAdapter, { autoConnect: true });
      await t.start();
      scanAdapter._scanCb({ id: 'auto-peer', name: 'Auto', rssi: -60 });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(scanAdapter.connect).toHaveBeenCalledWith('auto-peer');
      await t.stop();
    });
  });
});
