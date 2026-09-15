'use strict';

/**
 * @fileoverview BLE transport implementation for mesh network
 * @module transport/BLETransport
 */

const Transport = require('./Transport');
const {
  BLE_SERVICE_UUID,
  BLE_CHARACTERISTIC_TX,
  BLE_CHARACTERISTIC_RX,
  POWER_MODE,
  BLUETOOTH_STATE
} = require('../constants');
const { ConnectionError } = require('../errors');

/**
 * BLE transport implementation.
 * Handles Bluetooth Low Energy communication with peers.
 *
 * @class BLETransport
 * @extends Transport
 */
class BLETransport extends Transport {
  /**
   * Creates a new BLETransport instance
   * @param {any} adapter - BLE adapter instance (RNBLEAdapter or NodeBLEAdapter)
   * @param {Object} [options={}] - Transport options
   * @param {string} [options.powerMode='BALANCED'] - Power mode
   * @param {number} [options.maxPeers=8] - Maximum peers
   * @param {number} [options.connectTimeoutMs=10000] - Connection timeout
   * @param {number} [options.mtu=23] - Default BLE MTU
   * @param {boolean} [options.autoConnect=true] - Auto-connect to discovered devices
   * @param {boolean} [options.peripheral=true] - Start BLE peripheral (advertising + GATT server)
   */
  constructor(adapter, options = {}) {
    super(options);

    if (!adapter) {
      throw new Error('BLE adapter is required');
    }

    /**
     * BLE adapter instance
     * @type {any}
     * @private
     */
    this._adapter = adapter;

    /**
     * Current power mode
     * @type {any}
     * @private
     */
    // @ts-ignore
    this._powerMode = POWER_MODE[options.powerMode] || POWER_MODE.BALANCED;

    /**
     * Connection timeout in milliseconds
     * @type {number}
     * @private
     */
    this._connectTimeoutMs = options.connectTimeoutMs || 10000;

    /**
     * BLE MTU (Maximum Transmission Unit)
     * @type {number}
     * @private
     */
    this._mtu = options.mtu || 23; // Default BLE MTU

    /**
     * Whether scanning is active
     * @type {boolean}
     * @private
     */
    this._isScanning = false;

    /**
     * Per-peer write queues for serializing BLE writes
     * @type {Map<string, any[]>}
     * @private
     */
    this._writeQueue = new Map();

    /**
     * Per-peer write locks
     * @type {Map<string, boolean>}
     * @private
     */
    this._writing = new Map();

    /**
     * Whether to auto-connect to discovered devices
     * @type {boolean}
     * @private
     */
    this._autoConnect = options.autoConnect !== false;

    /**
     * Whether to start the BLE peripheral (advertiser + GATT server)
     * @type {boolean}
     * @private
     */
    this._enablePeripheral = options.peripheral !== false;

    /**
     * Peripheral power profile
     * @type {any}
     * @private
     */
    this._peripheralPower = this._powerMode;

    /**
     * Device IDs with an in-progress central connection
     * @type {Set<string>}
     * @private
     */
    this._pendingConnections = new Set();

    /**
     * Bound event handlers for cleanup
     * @type {any}
     * @private
     */
    this._handlers = {
      onStateChange: this._handleStateChange.bind(this),
      onDeviceDiscovered: this._handleDeviceDiscovered.bind(this),
      onDeviceDisconnected: this._handleDeviceDisconnected.bind(this),
      onPeripheralCentralConnected: this._handlePeripheralCentralConnected.bind(this),
      onPeripheralCentralDisconnected: this._handlePeripheralCentralDisconnected.bind(this),
      onPeripheralWrite: this._handlePeripheralWrite.bind(this),
      onPeripheralMtuChanged: this._handlePeripheralMtuChanged.bind(this),
      onPeripheralError: this._handlePeripheralError.bind(this)
    };

    /**
     * Active peripheral event subscriptions
     * @type {any[]}
     * @private
     */
    this._peripheralSubscriptions = [];
  }

  /**
   * Gets whether scanning is active
   * @returns {boolean} True if scanning
   */
  get isScanning() {
    return this._isScanning;
  }

  /**
   * Gets the current BLE MTU
   * @returns {number} Current MTU in bytes
   */
  get mtu() {
    return this._mtu;
  }

  /**
   * Starts the BLE transport
   * @returns {Promise<void>}
   * @throws {ConnectionError} If Bluetooth is unavailable
   */
  async start() {
    if (this.isRunning) {
      return;
    }

    this._setState(Transport.STATE.STARTING);

    try {
      await this._adapter.initialize();
      const state = await this._adapter.getState();

      if (state !== BLUETOOTH_STATE.POWERED_ON) {
        throw ConnectionError.fromCode('E100', null, { state });
      }

      this._adapter.onStateChange(this._handlers.onStateChange);

      // Register disconnect callback if adapter supports it
      if (typeof this._adapter.onDeviceDisconnected === 'function') {
        this._adapter.onDeviceDisconnected((/** @type {any} */ peerId) => {
          this._handleDeviceDisconnected(peerId);
        });
      }

      // Register peripheral event listeners
      this._registerPeripheralListeners();

      // Start BLE peripheral (advertising + GATT server)
      if (this._enablePeripheral) {
        await this._startPeripheral();
      }

      this._setState(Transport.STATE.RUNNING);

      // Auto-start scanning for peers
      await this.startScanning();
    } catch (/** @type {any} */ error) {
      this._setState(Transport.STATE.ERROR);
      throw error;
    }
  }

  /**
   * Stops the BLE transport
   * @returns {Promise<void>}
   */
  async stop() {
    if (this._state === Transport.STATE.STOPPED) {
      return;
    }

    this._setState(Transport.STATE.STOPPING);

    try {
      if (this._isScanning) {
        await this.stopScanning();
      }

      // Disconnect all peers
      const disconnectPromises = [];
      for (const peerId of this._peers.keys()) {
        disconnectPromises.push(this.disconnectFromPeer(peerId));
      }
      await Promise.all(disconnectPromises);

      // Stop peripheral and remove listeners
      this._unregisterPeripheralListeners();
      if (this._adapter && typeof this._adapter.stopPeripheral === 'function') {
        try {
          await this._adapter.stopPeripheral();
        } catch (/** @type {any} */ error) {
          // ignore cleanup errors
        }
      }

      await this._adapter.destroy();
    } finally {
      this._setState(Transport.STATE.STOPPED);
    }
  }

  /**
   * Starts scanning for BLE devices
   * @returns {Promise<void>}
   */
  async startScanning() {
    if (!this.isRunning || this._isScanning) {
      return;
    }

    await this._adapter.startScan(
      [BLE_SERVICE_UUID],
      this._handlers.onDeviceDiscovered
    );
    this._isScanning = true;
    this.emit('scanStarted');
  }

  /**
   * Stops scanning for BLE devices
   */
  stopScanning() {
    if (this._isScanning) {
      this._adapter.stopScan();
      this._isScanning = false;
      this.emit('scanStopped');
    }
  }

  /**
   * Connects to a specific peer device
   * @param {string} peerId - Device ID to connect to
   * @returns {Promise<void>}
   * @throws {ConnectionError} If connection fails
   */
  async connectToPeer(peerId) {
    if (!this.isRunning) {
      throw new Error('Transport is not running');
    }

    if (this._peers.has(peerId)) {
      throw ConnectionError.fromCode('E206', peerId);
    }

    if (!this.canAcceptPeer()) {
      throw ConnectionError.fromCode('E203', peerId);
    }

    try {
      /** @type {any} */ let timeoutId;
      const timeoutPromise = new Promise((_, reject) => {
        // @ts-ignore setTimeout is provided by the JS runtime; @types/node is not installed here
        timeoutId = setTimeout(() => reject(new Error('Connection timeout')), this._connectTimeoutMs);
      });
      const device = await Promise.race([
        this._adapter.connect(peerId).then((/** @type {any} */ d) => {
          // @ts-ignore clearTimeout is provided by the JS runtime; @types/node is not installed here
          clearTimeout(timeoutId); return d;
        }),
        timeoutPromise
      ]);

      // Negotiate MTU for larger payloads
      let negotiatedMtu = this._mtu;
      try {
        if (typeof this._adapter.requestMTU === 'function') {
          const mtu = await this._adapter.requestMTU(peerId, 512);
          if (mtu) {
            negotiatedMtu = mtu;
          }
        }
      } catch (mtuError) {
        // MTU negotiation failure is non-fatal, continue with default MTU
      }

      // Subscribe to notifications
      await this._adapter.subscribe(
        peerId,
        BLE_SERVICE_UUID,
        BLE_CHARACTERISTIC_RX,
        (/** @type {any} */ data) => this._handleData(peerId, data)
      );

      const connectionInfo = {
        peerId,
        role: 'central',
        device,
        connectedAt: Date.now(),
        mtu: negotiatedMtu
      };

      this._pendingConnections.delete(peerId);
      this._peers.set(peerId, connectionInfo);
      this.emit('peerConnected', { peerId, rssi: device.rssi || -50 });
    } catch (/** @type {any} */ error) {
      this._pendingConnections.delete(peerId);
      if (error.message === 'Connection timeout') {
        throw ConnectionError.connectionTimeout(peerId);
      }
      throw ConnectionError.connectionFailed(peerId, { cause: error.message });
    }
  }

  /**
   * Disconnects from a specific peer
   * @param {string} peerId - Peer ID to disconnect from
   * @returns {Promise<void>}
   */
  async disconnectFromPeer(peerId) {
    if (!this._peers.has(peerId)) {
      return;
    }

    const peerInfo = this._peers.get(peerId);

    try {
      if (peerInfo && peerInfo.role === 'peripheral') {
        if (typeof this._adapter.cancelPeripheralConnection === 'function') {
          await this._adapter.cancelPeripheralConnection(peerId);
        }
      } else {
        await this._adapter.disconnect(peerId);
      }
    } finally {
      this._peers.delete(peerId);

      // Clean up write queue and writing state
      const queue = this._writeQueue.get(peerId);
      if (queue) {
        queue.forEach(({ reject }) => reject(new Error('Peer disconnected')));
        this._writeQueue.delete(peerId);
      }
      this._writing.delete(peerId);

      this.emit('peerDisconnected', { peerId, reason: 'user_request' });
    }
  }

  /**
   * Sends data to a specific peer
   * @param {string} peerId - Target peer ID
   * @param {Uint8Array} data - Data to send
   * @returns {Promise<void>}
   * @throws {ConnectionError} If peer is not connected
   */
  async send(peerId, data) {
    if (!this.isRunning) {
      throw new Error('Transport is not running');
    }

    if (!this._peers.has(peerId)) {
      throw ConnectionError.fromCode('E207', peerId);
    }

    const peerInfo = this._peers.get(peerId);
    const mtu = peerInfo.mtu || this._mtu || 23;
    const chunkSize = Math.max(mtu - 3, 20); // ATT header overhead, minimum 20

    if (data.length <= chunkSize) {
      await this._sendChunk(peerId, peerInfo, data);
      return;
    }

    // Chunk data for BLE MTU compliance
    for (let offset = 0; offset < data.length; offset += chunkSize) {
      const chunk = data.subarray(offset, Math.min(offset + chunkSize, data.length));
      await this._sendChunk(peerId, peerInfo, chunk);
    }
  }

  /**
   * Sends a single chunk using the appropriate role
   * @param {string} peerId - Target peer ID
   * @param {any} peerInfo - Peer connection info
   * @param {Uint8Array} chunk - Data chunk
   * @returns {Promise<void>}
   * @private
   */
  async _sendChunk(peerId, peerInfo, chunk) {
    if (peerInfo.role === 'peripheral') {
      await this._adapter.notifyPeripheralCharacteristic(
        peerId,
        BLE_SERVICE_UUID,
        BLE_CHARACTERISTIC_RX,
        chunk
      );
    } else {
      await this._queuedWrite(peerId, chunk);
    }
  }

  /**
   * Broadcasts data to all connected peers
   * @param {Uint8Array} data - Data to broadcast
   * @returns {Promise<string[]>} Array of peer IDs that received the broadcast
   */
  async broadcast(data) {
    if (!this.isRunning) {
      throw new Error('Transport is not running');
    }

    const peerIds = this.getConnectedPeers();
    const results = await Promise.allSettled(
      peerIds.map(peerId => this.send(peerId, data))
    );

    return peerIds.filter((_, i) => results[i].status === 'fulfilled');
  }

  /**
   * Sets the power mode for BLE operations
   * @param {string} modeName - Power mode name (PERFORMANCE, BALANCED, POWER_SAVER)
   */
  setPowerMode(modeName) {
    const mode = /** @type {any} */ (POWER_MODE)[modeName];
    if (mode) {
      this._powerMode = mode;
      this._peripheralPower = mode;
    }
  }

  /**
   * Starts the BLE peripheral (advertising + GATT server)
   * @returns {Promise<void>}
   * @private
   */
  async _startPeripheral() {
    if (!this._adapter || typeof this._adapter.startPeripheral !== 'function') {
      return;
    }

    try {
      const powerMode = this._peripheralPower || POWER_MODE.BALANCED;
      await this._adapter.startPeripheral({
        serviceUuid: BLE_SERVICE_UUID,
        txCharUuid: BLE_CHARACTERISTIC_TX,
        rxCharUuid: BLE_CHARACTERISTIC_RX,
        advertiseMode: this._mapPowerModeToAdvertiseMode(powerMode),
        deviceName: null
      });
    } catch (/** @type {any} */ error) {
      // Peripheral mode is optional: emit warning but keep central scanning alive
      this.emit('peripheralUnavailable', { reason: error.message });
    }
  }

  /**
   * Maps an internal power mode to the native advertising mode
   * @param {any} mode - Internal power mode
   * @returns {string} Native advertising mode
   * @private
   */
  _mapPowerModeToAdvertiseMode(mode) {
    if (mode === POWER_MODE.PERFORMANCE) {
      return 'lowLatency';
    }
    if (mode === POWER_MODE.POWER_SAVER) {
      return 'lowPower';
    }
    return 'balanced';
  }

  /**
   * Registers peripheral-side event listeners
   * @private
   */
  _registerPeripheralListeners() {
    if (!this._adapter) {
      return;
    }
    const listenerNames = [
      'onPeripheralCentralConnected',
      'onPeripheralCentralDisconnected',
      'onPeripheralWrite',
      'onPeripheralMtuChanged',
      'onPeripheralError'
    ];
    for (const name of listenerNames) {
      if (typeof this._adapter[name] === 'function') {
        const sub = this._adapter[name](this._handlers[name]);
        if (sub && typeof sub.remove === 'function') {
          this._peripheralSubscriptions.push(sub);
        }
      }
    }
  }

  /**
   * Unregisters peripheral-side event listeners
   * @private
   */
  _unregisterPeripheralListeners() {
    for (const sub of this._peripheralSubscriptions) {
      if (sub && typeof sub.remove === 'function') {
        sub.remove();
      }
    }
    this._peripheralSubscriptions = [];
  }

  /**
   * Handles Bluetooth state changes
   * @param {string} state - New Bluetooth state
   * @private
   */
  _handleStateChange(state) {
    this.emit('bluetoothState', { state });

    if (state !== BLUETOOTH_STATE.POWERED_ON && this.isRunning) {
      this._setState(Transport.STATE.ERROR);
      this.emit('error', { error: ConnectionError.fromCode('E102') });
    }
  }

  /**
   * Handles discovered BLE devices
   * @param {any} device - Discovered device info
   * @private
   */
  _handleDeviceDiscovered(device) {
    this.emit('deviceDiscovered', {
      peerId: device.id,
      name: device.name,
      rssi: device.rssi
    });

    if (!this._autoConnect || !this.isRunning || !this.canAcceptPeer()) {
      return;
    }

    if (this._peers.has(device.id) || this._pendingConnections.has(device.id)) {
      return;
    }

    this._pendingConnections.add(device.id);
    this.connectToPeer(device.id).catch(() => {
      this._pendingConnections.delete(device.id);
    });
  }

  /**
   * Handles device disconnection events
   * @param {string} peerId - Disconnected peer ID
   * @private
   */
  _handleDeviceDisconnected(peerId) {
    if (this._peers.has(peerId)) {
      this._peers.delete(peerId);

      // Clean up write queue
      const queue = this._writeQueue.get(peerId);
      if (queue) {
        queue.forEach(({ reject }) => reject(new Error('Peer disconnected')));
        this._writeQueue.delete(peerId);
      }
      this._writing.delete(peerId);

      this.emit('peerDisconnected', { peerId, reason: 'connection_lost' });
    }
  }

  /**
   * Handles a central connecting to the peripheral GATT server
   * @param {string} peerId - Central device ID
   * @private
   */
  _handlePeripheralCentralConnected(peerId) {
    if (this._peers.has(peerId)) {
      return;
    }
    if (!this.canAcceptPeer()) {
      return;
    }
    this._peers.set(peerId, {
      peerId,
      role: 'peripheral',
      connectedAt: Date.now(),
      mtu: this._mtu
    });
    this.emit('peerConnected', { peerId, rssi: -50 });
  }

  /**
   * Handles a central disconnecting from the peripheral GATT server
   * @param {string} peerId - Central device ID
   * @private
   */
  _handlePeripheralCentralDisconnected(peerId) {
    this._handleDeviceDisconnected(peerId);
  }

  /**
   * Handles an incoming write from a connected central
   * @param {Object} event - Write event
   * @param {string} event.deviceId - Source central device ID
   * @param {Uint8Array} event.data - Received data
   * @private
   */
  _handlePeripheralWrite({ deviceId, data }) {
    if (!this._peers.has(deviceId)) {
      // Auto-add if we have room and peer is not in the map
      if (this.canAcceptPeer()) {
        this._peers.set(deviceId, {
          peerId: deviceId,
          role: 'peripheral',
          connectedAt: Date.now(),
          mtu: this._mtu
        });
        this.emit('peerConnected', { peerId: deviceId, rssi: -50 });
      }
    }
    this._handleData(deviceId, data);
  }

  /**
   * Handles a peripheral-side MTU change
   * @param {Object} event - MTU change event
   * @param {string} event.deviceId - Central device ID
   * @param {number} event.mtu - Negotiated MTU
   * @private
   */
  _handlePeripheralMtuChanged({ deviceId, mtu }) {
    const peerInfo = this._peers.get(deviceId);
    if (peerInfo) {
      peerInfo.mtu = mtu || this._mtu;
    }
  }

  /**
   * Handles peripheral server errors
   * @param {Object} event - Error event
   * @param {string} event.message - Error message
   * @private
   */
  _handlePeripheralError(event) {
    this.emit('peripheralUnavailable', { reason: event.message });
  }

  /**
   * Handles incoming data from a peer
   * @param {string} peerId - Source peer ID
   * @param {Uint8Array} data - Received data
   * @private
   */
  _handleData(peerId, data) {
    this.emit('message', { peerId, data: data instanceof Uint8Array ? data : new Uint8Array(data) });
  }

  /**
   * Creates a timeout promise
   * @param {number} ms - Timeout in milliseconds
   * @param {string} message - Error message
   * @returns {Promise<never>}
   * @private
   */
  _createTimeout(ms, message) {
    return new Promise((_, reject) => {
      // @ts-ignore setTimeout is provided by the JS runtime; @types/node is not installed here
      setTimeout(() => reject(new Error(message)), ms);
    });
  }

  /**
   * Queues a write operation to serialize BLE writes
   * @param {string} peerId - Target peer ID
   * @param {Uint8Array} data - Data to write
   * @returns {Promise<void>}
   * @private
   */
  async _queuedWrite(peerId, data) {
    if (!this._writeQueue.has(peerId)) {
      this._writeQueue.set(peerId, []);
    }

    return new Promise((resolve, reject) => {
      // @ts-ignore
      this?._writeQueue.get(peerId).push({ data, resolve, reject });
      this._processWriteQueue(peerId);
    });
  }

  /**
   * Processes the write queue for a peer
   * @param {string} peerId - Target peer ID
   * @returns {Promise<void>}
   * @private
   */
  async _processWriteQueue(peerId) {
    if (this._writing.get(peerId)) { return; } // Already processing

    const queue = this._writeQueue.get(peerId);
    if (!queue || queue.length === 0) { return; }

    this._writing.set(peerId, true);

    while (queue.length > 0) {
      const { data, resolve, reject } = queue.shift();
      try {
        await this._adapter.write(peerId, BLE_SERVICE_UUID, BLE_CHARACTERISTIC_TX, data);
        resolve();
      } catch (err) {
        reject(err);
      }
    }

    this._writing.set(peerId, false);
  }
}

module.exports = BLETransport;
