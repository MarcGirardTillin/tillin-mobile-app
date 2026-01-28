import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Printer } from './src/printer/Printer';

type BleDevice = { name: string; address?: string; uuid?: string };

function App() {
  const [ip, setIp] = useState('');
  const [port, setPort] = useState('9100');
  const [bleAddress, setBleAddress] = useState('');
  const [usbPath, setUsbPath] = useState('');
  const [barcode, setBarcode] = useState('123456789');
  const [base64, setBase64] = useState('');
  const [bonded, setBonded] = useState<BleDevice[]>([]);
  const [bleDevices, setBleDevices] = useState<BleDevice[]>([]);
  const [usbDevices, setUsbDevices] = useState<string[]>([]);
  const [logs, setLogs] = useState<string[]>([]);

  const log = (msg: string) =>
    setLogs(prev => [`${new Date().toLocaleTimeString()} ${msg}`, ...prev]);

  useEffect(() => {
    Printer.initialize().catch(e => log(`init error: ${String(e)}`));
    const subDevices = Printer.onBleDevices(devs => setBleDevices(devs));
    const subState = Printer.onBleState(state =>
      log(`BLE connected: ${state.connected}`)
    );
    return () => {
      subDevices.remove();
      subState.remove();
    };
  }, []);

  const parsedPort = useMemo(() => {
    const val = parseInt(port, 10);
    return Number.isFinite(val) ? val : 9100;
  }, [port]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Tillin Printer Test</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bluetooth</Text>
          {Platform.OS === 'android' ? (
            <>
              <Button
                title="Request Permissions"
                onPress={async () => {
                  const ok = await Printer.requestAndroidPermissions();
                  log(`Android permissions: ${ok}`);
                }}
              />
              <View style={styles.spacer} />
              <Button
                title="Load Paired Devices"
                onPress={async () => {
                  const list = await Printer.getBondedBluetoothDevices();
                  setBonded(list);
                  log(`Paired devices: ${list.length}`);
                }}
              />
            </>
          ) : (
            <>
              <Button title="Start BLE Scan" onPress={() => Printer.startBleScan()} />
              <View style={styles.spacer} />
              <Button title="Stop BLE Scan" onPress={() => Printer.stopBleScan()} />
            </>
          )}

          <View style={styles.spacer} />
          <TextInput
            style={styles.input}
            value={bleAddress}
            onChangeText={setBleAddress}
            placeholder={
              Platform.OS === 'android' ? 'MAC address' : 'UUID (from scan)'
            }
            autoCapitalize="none"
          />
          <View style={styles.spacer} />
          <Button
            title="Connect Bluetooth"
            onPress={async () => {
              try {
                await Printer.connectBluetooth(bleAddress);
                log('Bluetooth connected');
              } catch (e) {
                log(`Bluetooth error: ${String(e)}`);
              }
            }}
          />

          {Platform.OS === 'android' && bonded.length > 0 && (
            <View style={styles.list}>
              {bonded.map(d => (
                <Button
                  key={d.address}
                  title={`${d.name || 'Unnamed'} (${d.address})`}
                  onPress={() => setBleAddress(d.address || '')}
                />
              ))}
            </View>
          )}

          {Platform.OS === 'ios' && bleDevices.length > 0 && (
            <View style={styles.list}>
              {bleDevices.map(d => (
                <Button
                  key={d.uuid}
                  title={`${d.name || 'Unnamed'} (${d.uuid})`}
                  onPress={() => setBleAddress(d.uuid || '')}
                />
              ))}
            </View>
          )}
        </View>

        {Platform.OS === 'android' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>USB (Android)</Text>
            <Button
              title="List USB Devices"
              onPress={async () => {
                const list = await Printer.listUsbDevices();
                setUsbDevices(list);
                log(`USB devices: ${list.length}`);
              }}
            />
            <View style={styles.spacer} />
            <TextInput
              style={styles.input}
              value={usbPath}
              onChangeText={setUsbPath}
              placeholder="USB path"
              autoCapitalize="none"
            />
            <View style={styles.spacer} />
            <Button
              title="Connect USB"
              onPress={async () => {
                try {
                  await Printer.connectUsb(usbPath);
                  log('USB connected');
                } catch (e) {
                  log(`USB error: ${String(e)}`);
                }
              }}
            />
            {usbDevices.length > 0 && (
              <View style={styles.list}>
                {usbDevices.map(path => (
                  <Button key={path} title={path} onPress={() => setUsbPath(path)} />
                ))}
              </View>
            )}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ethernet / Wi‑Fi</Text>
          <TextInput
            style={styles.input}
            value={ip}
            onChangeText={setIp}
            placeholder="Printer IP"
            autoCapitalize="none"
          />
          <View style={styles.spacer} />
          <TextInput
            style={styles.input}
            value={port}
            onChangeText={setPort}
            placeholder="Port (default 9100)"
            keyboardType="number-pad"
          />
          <View style={styles.spacer} />
          <Button
            title="Connect Network"
            onPress={async () => {
              try {
                await Printer.connectNetwork(ip, parsedPort);
                log('Network connected');
              } catch (e) {
                log(`Network error: ${String(e)}`);
              }
            }}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Print</Text>
          <Button
            title="Print Sample Text"
            onPress={async () => {
              try {
                await Printer.printText(
                  'Tillin Printer\\nMerci !\\n------------------------------\\n',
                  { align: 0, cut: true }
                );
                log('Text printed');
              } catch (e) {
                log(`Text error: ${String(e)}`);
              }
            }}
          />
          <View style={styles.spacer} />
          <TextInput
            style={styles.input}
            value={barcode}
            onChangeText={setBarcode}
            placeholder="Barcode content"
            autoCapitalize="none"
          />
          <View style={styles.spacer} />
          <Button
            title="Print Barcode"
            onPress={async () => {
              try {
                await Printer.printBarcode(barcode, {
                  type: 73,
                  height: 162,
                  width: 3,
                  hriPosition: 2,
                  align: 1,
                  cut: true,
                });
                log('Barcode printed');
              } catch (e) {
                log(`Barcode error: ${String(e)}`);
              }
            }}
          />
          <View style={styles.spacer} />
          <Button
            title="Print Local Logo"
            onPress={async () => {
              try {
                await Printer.printLocalLogo();
                log('Local logo printed');
              } catch (e) {
                log(`Logo error: ${String(e)}`);
              }
            }}
          />
          <View style={styles.spacer} />
          <Button
            title="Print ESC/POS Sample File"
            onPress={async () => {
              try {
                await Printer.printEscPosSample();
                log('ESC/POS sample printed');
              } catch (e) {
                log(`ESC/POS error: ${String(e)}`);
              }
            }}
          />
          <View style={styles.spacer} />
          <TextInput
            style={[styles.input, styles.multiline]}
            value={base64}
            onChangeText={setBase64}
            placeholder="Base64 image data (data:image/png;base64,...)"
            multiline
          />
          <View style={styles.spacer} />
          <Button
            title="Print Logo (Base64)"
            onPress={async () => {
              try {
                await Printer.printImage(base64, {
                  paperWidth: 576,
                  paperWidthMm: 80,
                  cut: true,
                });
                log('Image printed');
              } catch (e) {
                log(`Image error: ${String(e)}`);
              }
            }}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Session</Text>
          <Button
            title="Disconnect"
            onPress={async () => {
              await Printer.disconnect();
              log('Disconnected');
            }}
          />
          <View style={styles.logBox}>
            {logs.map(item => (
              <Text key={item} style={styles.logText}>
                {item}
              </Text>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0f1012',
  },
  container: {
    padding: 16,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  section: {
    backgroundColor: '#171a1f',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  sectionTitle: {
    color: '#d6d7da',
    fontWeight: '600',
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#0f1012',
    color: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#2b2f36',
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  spacer: {
    height: 8,
  },
  list: {
    gap: 6,
    marginTop: 8,
  },
  logBox: {
    marginTop: 8,
    backgroundColor: '#0b0d10',
    borderRadius: 8,
    padding: 10,
    minHeight: 120,
  },
  logText: {
    color: '#9aa3b2',
    fontSize: 12,
    marginBottom: 4,
  },
});

export default App;
