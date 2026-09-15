// @ts-nocheck
'use strict';

/**
 * @fileoverview React Native BLE adapter using react-native-ble-plx
 * @module transport/adapters/RNBLEAdapter
 */

const BLEAdapter = require('./BLEAdapter');

/**
 * React Native BLE adapter implementation.
 * Wraps react-native-ble-plx for BLE communication in React Native apps.
 *
 * NOTE: react-native-ble-plx is an optional peer dependency.
 * Install it separately: npm install react-native-ble-plx
 *
 * @class RNBLEAdapter
 * @extends BLEAdapter
 */
class RNBLEAdapter extends BLEAdapter {
  /**
   * Creates a new RNBLEAdapter instance
   * @param {Object} [options={}] - Adapter options
   * @param {any} [options.BleManager] - BleManager class from react-native-ble-plx
   */
  constructor(options = {}) {
    super(options);

    /**
     * BleManager instance
     * @type {any}
     * @private
     */
    this._manager = null;

    /**
     * BleManager class reference
     * @type {Function|null}
     * @private
     */
    this._BleManager = options.BleManager || null;

    /**
     * iOS state restoration identifier
     * @type {string|null}
     * @private
     */
    // @ts-ignore
    this._restoreIdentifier = options.restoreIdentifier || null;

    /**
     * Connected devices map
     * @type {Map<string, any>}
     * @private
     */
    this._devices = new Map();

    /**
     * Subscription handlers map
     * @type {Map<string, any>}
     * @private
     */
    this._subscriptions = new Map();

    /**
     * Scan subscription reference
     * @type {any}
     * @private
     */
    this._scanSubscription = null;

    /**
     * State subscription reference
     * @type {any}
     * @private
     */
    this._stateSubscription = null;

    /**
     * Disconnect callback
     * @type {Function|null}
     * @private
     */
    this._disconnectCallback = null;

    /**
     * Whether the peripheral GATT server is active
     * @type {boolean}
     * @private
     */
    this._peripheralStarted = false;

    /**
     * Peripheral event subscription handles
     * @type {any[]}
     * @private
     */
    this._peripheralSubscriptions = [];
  }

  /**
   * Initializes the BLE manager
   * @returns {Promise<void>}
   * @throws {Error} If react-native-ble-plx is not available
   */
  async initialize() {
    if (this._initialized) {
      return;
    }

    // Try to load BleManager if not provided
    if (!this._BleManager) {
      try {
        // @ts-ignore
        const blePlx = require('react-native-ble-plx');
        this._BleManager = blePlx.BleManager;
      } catch (error) {
        throw new Error(
          'react-native-ble-plx is required. Install with: npm install react-native-ble-plx'
        );
      }
    }

    const managerOptions = {};
    if (this._restoreIdentifier) {
      managerOptions.restoreStateIdentifier = this._restoreIdentifier;
      managerOptions.restoreStateFunction = (/** @type {any} */ restoredState) => {
        // Re-populate devices from restored state
        if (restoredState && restoredState.connectedPeripherals) {
          for (const peripheral of restoredState.connectedPeripherals) {
            this._devices.set(peripheral.id, peripheral);
          }
        }
      };
    }
    // @ts-ignore
    this._manager = new this._BleManager(managerOptions);

    // Subscribe to state changes
    this._stateSubscription = this._manager.onStateChange((/** @type {any} */ state) => {
      this._notifyStateChange(this._mapState(state));
    }, true);

    this._initialized = true;
  }

  /**
   * Destroys the BLE manager and releases resources
   * @returns {Promise<void>}
   */
  async destroy() {
    if (!this._initialized) {
      return;
    }

    // Cancel all subscriptions
    for (const subscription of this._subscriptions.values()) {
      subscription.remove();
    }
    this._subscriptions.clear();

    // Stop scanning
    this.stopScan();

    // Remove state subscription
    if (this._stateSubscription) {
      this._stateSubscription.remove();
      this._stateSubscription = null;
    }

    // Stop peripheral and remove peripheral subscriptions
    if (this._peripheralStarted) {
      await this.stopPeripheral();
    }
    for (const sub of this._peripheralSubscriptions) {
      if (sub && typeof sub.remove === 'function') {
        sub.remove();
      }
    }
    this._peripheralSubscriptions = [];

    // Disconnect all devices
    for (const deviceId of this._devices.keys()) {
      await this.disconnect(deviceId);
    }

    // Disconnect all connected centrals
    try {
      const peripherals = await this.connectedPeripherals();
      for (const device of peripherals) {
        await this.cancelPeripheralConnection(device.id);
      }
    } catch (error) {
      // ignore cleanup errors
    }

    // Destroy manager
    if (this._manager) {
      this._manager.destroy();
      this._manager = null;
    }

    this._initialized = false;
    this._peripheralStarted = false;
  }

  /**
   * Starts scanning for BLE devices
   * @param {string[]} serviceUUIDs - Service UUIDs to filter by
   * @param {Function} callback - Callback for discovered devices
   * @returns {Promise<void>}
   */
  async startScan(serviceUUIDs, callback) {
    this._ensureInitialized();

    this._manager.startDeviceScan(serviceUUIDs, null, (/** @type {any} */ error, /** @type {any} */ device) => {
      if (error) {
        return;
      }
      if (device) {
        callback({
          id: device.id,
          name: device.name || device.localName,
          rssi: device.rssi
        });
      }
    });
  }

  /**
   * Stops scanning for BLE devices
   */
  stopScan() {
    if (this._manager) {
      this._manager.stopDeviceScan();
    }
  }

  /**
   * Connects to a BLE device
   * @param {string} deviceId - Device ID to connect to
   * @returns {Promise<Object>} Connected device info
   */
  async connect(deviceId) {
    this._ensureInitialized();

    const device = await this._manager.connectToDevice(deviceId);
    await device.discoverAllServicesAndCharacteristics();

    this._devices.set(deviceId, device);

    // Monitor disconnection
    device.onDisconnected(() => {
      this._devices.delete(deviceId);

      // Clean up subscriptions for this device
      for (const [key, subscription] of this._subscriptions.entries()) {
        if (key.startsWith(`${deviceId}:`)) {
          subscription.remove();
          this._subscriptions.delete(key);
        }
      }

      // Notify transport
      if (this._disconnectCallback) {
        this._disconnectCallback(deviceId);
      }
    });

    return {
      id: device.id,
      name: device.name,
      rssi: device.rssi
    };
  }

  /**
   * Disconnects from a BLE device
   * @param {string} deviceId - Device ID to disconnect from
   * @returns {Promise<void>}
   */
  async disconnect(deviceId) {
    // Clean up subscriptions first
    for (const [key, subscription] of this._subscriptions.entries()) {
      if (key.startsWith(`${deviceId}:`)) {
        subscription.remove();
        this._subscriptions.delete(key);
      }
    }

    const device = this._devices.get(deviceId);
    if (device) {
      await this._manager.cancelDeviceConnection(deviceId);
      this._devices.delete(deviceId);
    }
  }

  /**
   * Writes data to a characteristic
   * @param {string} deviceId - Target device ID
   * @param {string} serviceUUID - Service UUID
   * @param {string} charUUID - Characteristic UUID
   * @param {Uint8Array} data - Data to write
   * @returns {Promise<void>}
   */
  async write(deviceId, serviceUUID, charUUID, data) {
    this._ensureInitialized();

    const base64Data = this._uint8ArrayToBase64(data);
    await this._manager.writeCharacteristicWithResponseForDevice(
      deviceId,
      serviceUUID,
      charUUID,
      base64Data
    );
  }

  /**
   * Subscribes to characteristic notifications
   * @param {string} deviceId - Target device ID
   * @param {string} serviceUUID - Service UUID
   * @param {string} charUUID - Characteristic UUID
   * @param {Function} callback - Notification callback
   * @returns {Promise<void>}
   */
  async subscribe(deviceId, serviceUUID, charUUID, callback) {
    this._ensureInitialized();

    const key = `${deviceId}:${serviceUUID}:${charUUID}`;
    const subscription = this._manager.monitorCharacteristicForDevice(
      deviceId,
      serviceUUID,
      charUUID,
      (/** @type {any} */ error, /** @type {any} */ characteristic) => {
        if (!error && characteristic) {
          const data = this._base64ToUint8Array(characteristic.value);
          callback(data);
        }
      }
    );

    this._subscriptions.set(key, subscription);
  }

  /**
   * Gets the current Bluetooth state
   * @returns {Promise<string>} Bluetooth state
   */
  async getState() {
    this._ensureInitialized();
    const state = await this._manager.state();
    return this._mapState(state);
  }

  /**
   * Maps react-native-ble-plx state to BLEAdapter state
   * @param {string} state - RN BLE state
   * @returns {string} Mapped state
   * @private
   */
  _mapState(state) {
    const stateMap = {
      Unknown: BLEAdapter.STATE.UNKNOWN,
      Resetting: BLEAdapter.STATE.RESETTING,
      Unsupported: BLEAdapter.STATE.UNSUPPORTED,
      Unauthorized: BLEAdapter.STATE.UNAUTHORIZED,
      PoweredOff: BLEAdapter.STATE.POWERED_OFF,
      PoweredOn: BLEAdapter.STATE.POWERED_ON
    };
    return /** @type {any} */ (stateMap)[state] || BLEAdapter.STATE.UNKNOWN;
  }

  /**
   * Registers a callback for device disconnection events
   * @param {Function} callback - Callback function receiving peerId
   */
  onDeviceDisconnected(callback) {
    this._disconnectCallback = callback;
  }

  /**
   * Requests an MTU update for a connected device
   * @param {string} deviceId - Target device ID
   * @param {number} mtu - Desired MTU
   * @returns {Promise<number>} Negotiated MTU
   */
  async requestMTU(deviceId, mtu) {
    this._ensureInitialized();
    const device = this._devices.get(deviceId);
    if (device && typeof device.requestMTU === 'function') {
      const updated = await device.requestMTU(mtu);
      return updated.mtu || mtu;
    }
    if (typeof this._manager.requestMTUForDevice === 'function') {
      const updated = await this._manager.requestMTUForDevice(deviceId, mtu);
      return updated.mtu || mtu;
    }
    return mtu;
  }

  // --------------------------------------------------------------------------
  // Peripheral mode (GATT server + advertiser)
  // --------------------------------------------------------------------------

  /**
   * Starts the BLE peripheral (advertising + GATT server)
   * @param {Object} config - Peripheral configuration
   * @param {string} config.serviceUuid - Service UUID to advertise
   * @param {string} config.txCharUuid - TX (write) characteristic UUID
   * @param {string} config.rxCharUuid - RX (notify) characteristic UUID
   * @param {string} [config.advertiseMode] - Advertising power mode
   * @param {string|null} [config.deviceName] - Local device name
   * @returns {Promise<void>}
   */
  async startPeripheral(config) {
    this._ensureInitialized();
    if (typeof this._manager.startPeripheral !== 'function') {
      throw new Error('BleManager does not support peripheral mode');
    }
    await this._manager.startPeripheral(config);
    this._peripheralStarted = true;
  }

  /**
   * Stops the BLE peripheral
   * @returns {Promise<void>}
   */
  async stopPeripheral() {
    if (this._manager && this._peripheralStarted && typeof this._manager.stopPeripheral === 'function') {
      try {
        await this._manager.stopPeripheral();
      } catch (error) {
        // ignore cleanup errors
      }
    }
    this._peripheralStarted = false;
  }

  /**
   * Sends a notification to a connected central on a peripheral characteristic
   * @param {string} deviceId - Central device ID
   * @param {string} serviceUUID - Service UUID
   * @param {string} charUUID - Characteristic UUID
   * @param {Uint8Array} data - Data to notify
   * @returns {Promise<void>}
   */
  async notifyPeripheralCharacteristic(deviceId, serviceUUID, charUUID, data) {
    this._ensureInitialized();
    if (typeof this._manager.notifyPeripheralCharacteristic !== 'function') {
      throw new Error('BleManager does not support peripheral notifications');
    }
    const valueBase64 = this._uint8ArrayToBase64(data);
    await this._manager.notifyPeripheralCharacteristic(deviceId, serviceUUID, charUUID, valueBase64);
  }

  /**
   * Cancels a peripheral-side connection to a central
   * @param {string} deviceId - Central device ID
   * @returns {Promise<void>}
   */
  async cancelPeripheralConnection(deviceId) {
    if (this._manager && typeof this._manager.cancelPeripheralConnection === 'function') {
      await this._manager.cancelPeripheralConnection(deviceId);
    }
  }

  /**
   * Lists centrals currently connected to the peripheral GATT server
   * @returns {Promise<Array<{id: string, name: string|null, rssi: number|null}>>}
   */
  async connectedPeripherals() {
    this._ensureInitialized();
    if (typeof this._manager.connectedPeripherals !== 'function') {
      return [];
    }
    const devices = await this._manager.connectedPeripherals();
    return devices.map((device) => ({
      id: device.id,
      name: device.name || device.localName || null,
      rssi: device.rssi
    }));
  }

  /**
   * Gets the MTU negotiated with a connected central
   * @param {string} deviceId - Central device ID
   * @returns {Promise<number>}
   */
  async peripheralMTU(deviceId) {
    this._ensureInitialized();
    if (typeof this._manager.peripheralMTU !== 'function') {
      return 23;
    }
    return this._manager.peripheralMTU(deviceId);
  }

  /**
   * Registers a callback for a central connecting to the peripheral GATT server
   * @param {Function} callback - Callback function receiving deviceId
   */
  onPeripheralCentralConnected(callback) {
    if (this._manager && typeof this._manager.onPeripheralCentralConnected === 'function') {
      const sub = this._manager.onPeripheralCentralConnected((deviceId) => callback(deviceId));
      if (sub && typeof sub.remove === 'function') {
        this._peripheralSubscriptions.push(sub);
      }
    }
  }

  /**
   * Registers a callback for a central disconnecting from the peripheral GATT server
   * @param {Function} callback - Callback function receiving deviceId
   */
  onPeripheralCentralDisconnected(callback) {
    if (this._manager && typeof this._manager.onPeripheralCentralDisconnected === 'function') {
      const sub = this._manager.onPeripheralCentralDisconnected((deviceId) => callback(deviceId));
      if (sub && typeof sub.remove === 'function') {
        this._peripheralSubscriptions.push(sub);
      }
    }
  }

  /**
   * Registers a callback for writes from a connected central on the peripheral TX characteristic
   * @param {Function} callback - Callback function receiving {deviceId, data}
   */
  onPeripheralWrite(callback) {
    if (this._manager && typeof this._manager.onPeripheralWrite === 'function') {
      const sub = this._manager.onPeripheralWrite((event) => {
        const data = this._base64ToUint8Array(event.value);
        callback({ deviceId: event.deviceId, data });
      });
      if (sub && typeof sub.remove === 'function') {
        this._peripheralSubscriptions.push(sub);
      }
    }
  }

  /**
   * Registers a callback for MTU changes on a peripheral connection
   * @param {Function} callback - Callback function receiving {deviceId, mtu}
   */
  onPeripheralMtuChanged(callback) {
    if (this._manager && typeof this._manager.onPeripheralMtuChanged === 'function') {
      const sub = this._manager.onPeripheralMtuChanged((event) => callback(event));
      if (sub && typeof sub.remove === 'function') {
        this._peripheralSubscriptions.push(sub);
      }
    }
  }

  /**
   * Registers a callback for subscription changes from a connected central
   * @param {Function} callback - Callback function receiving {deviceId, serviceUUID, characteristicUUID, subscribed}
   */
  onPeripheralSubscriptionChanged(callback) {
    if (this._manager && typeof this._manager.onPeripheralSubscriptionChanged === 'function') {
      const sub = this._manager.onPeripheralSubscriptionChanged((event) => callback(event));
      if (sub && typeof sub.remove === 'function') {
        this._peripheralSubscriptions.push(sub);
      }
    }
  }

  /**
   * Registers a callback for peripheral server errors
   * @param {Function} callback - Callback function receiving {message}
   */
  onPeripheralError(callback) {
    if (this._manager && typeof this._manager.onPeripheralError === 'function') {
      const sub = this._manager.onPeripheralError((event) => callback(event));
      if (sub && typeof sub.remove === 'function') {
        this._peripheralSubscriptions.push(sub);
      }
    }
  }

  /**
   * Ensures the adapter is initialized
   * @throws {Error} If not initialized
   * @private
   */
  _ensureInitialized() {
    if (!this._initialized) {
      throw new Error('RNBLEAdapter is not initialized');
    }
  }

  /**
   * Converts Uint8Array to Base64 string
   * @param {Uint8Array} bytes - Bytes to convert
   * @returns {string} Base64 string
   * @private
   */
  _uint8ArrayToBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Converts Base64 string to Uint8Array
   * @param {string} base64 - Base64 string
   * @returns {Uint8Array} Byte array
   * @private
   */
  _base64ToUint8Array(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}

module.exports = RNBLEAdapter;
