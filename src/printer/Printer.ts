import {
  NativeEventEmitter,
  NativeModules,
  PermissionsAndroid,
  Platform,
} from 'react-native';

const { PrinterNative } = NativeModules as {
  PrinterNative: {
    initialize: () => Promise<boolean>;
    getBondedBluetoothDevices: () => Promise<
      Array<{ name: string; address: string }>
    >;
    listUsbDevices: () => Promise<string[]>;
    startBleScan: () => void;
    stopBleScan: () => void;
    connectBluetooth: (addressOrUuid: string) => Promise<boolean>;
    connectUsb: (usbPath: string) => Promise<boolean>;
    connectNetwork: (host: string, port: number) => Promise<boolean>;
    disconnect: () => Promise<boolean>;
    printText: (text: string, options?: Record<string, unknown>) => Promise<boolean>;
    printBarcode: (
      content: string,
      options?: Record<string, unknown>
    ) => Promise<boolean>;
    printImage: (
      base64: string,
      options?: Record<string, unknown>
    ) => Promise<boolean>;
    printLocalLogo: () => Promise<boolean>;
    printEscPosText: (
      raw: string,
      options?: Record<string, unknown>
    ) => Promise<boolean>;
    printEscPosSample: () => Promise<boolean>;
    printEscPosBase64: (base64: string) => Promise<boolean>;
  };
};

if (!PrinterNative) {
  throw new Error('PrinterNative module not linked');
}

const emitter = new NativeEventEmitter(PrinterNative);

export const Printer = {
  initialize: () => PrinterNative.initialize(),
  getBondedBluetoothDevices: () => PrinterNative.getBondedBluetoothDevices(),
  listUsbDevices: () => PrinterNative.listUsbDevices(),
  startBleScan: () => PrinterNative.startBleScan(),
  stopBleScan: () => PrinterNative.stopBleScan(),
  connectBluetooth: (addressOrUuid: string) =>
    PrinterNative.connectBluetooth(addressOrUuid),
  connectUsb: (usbPath: string) => PrinterNative.connectUsb(usbPath),
  connectNetwork: (host: string, port = 9100) =>
    PrinterNative.connectNetwork(host, port),
  disconnect: () => PrinterNative.disconnect(),
  printText: (text: string, options?: Record<string, unknown>) =>
    PrinterNative.printText(text, options),
  printBarcode: (content: string, options?: Record<string, unknown>) =>
    PrinterNative.printBarcode(content, options),
  printImage: (base64: string, options?: Record<string, unknown>) =>
    PrinterNative.printImage(base64, options),
  printLocalLogo: () => PrinterNative.printLocalLogo(),
  printEscPosText: (raw: string, options?: Record<string, unknown>) =>
    PrinterNative.printEscPosText(raw, options),
  printEscPosSample: () => PrinterNative.printEscPosSample(),
  printEscPosBase64: (base64: string) =>
    PrinterNative.printEscPosBase64(base64),
  onBleDevices: (handler: (devices: Array<{ name: string; uuid: string }>) => void) =>
    emitter.addListener('PrinterBleDevices', handler),
  onBleState: (handler: (state: { connected: boolean }) => void) =>
    emitter.addListener('PrinterBleState', handler),
  async requestAndroidPermissions() {
    if (Platform.OS !== 'android') {
      return true;
    }
    const permissions: string[] = [];
    if (Platform.Version >= 31) {
      permissions.push(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
      );
    } else {
      permissions.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    }
    const results = await PermissionsAndroid.requestMultiple(permissions);
    return Object.values(results).every(
      result => result === PermissionsAndroid.RESULTS.GRANTED
    );
  },
};
