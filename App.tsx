import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { WebView } from 'react-native-webview';
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { Printer } from './src/printer/Printer';

type BleDevice = { name: string; address?: string; uuid?: string };
type WebMessage = {
  type: string;
  payload?: string;
  payloadBase64?: string;
  base64?: string;
  encoding?: string;
  id?: string | number;
};

const DEFAULT_WEB_URL = 'https://app.tillin.fr';

function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const [mode, setMode] = useState<'web' | 'printer'>('web');
  const [webUrl, setWebUrl] = useState(DEFAULT_WEB_URL);
  const [webUser, setWebUser] = useState('');
  const [webPass, setWebPass] = useState('');
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
  const webRef = useRef<WebView>(null);
  const insets = useSafeAreaInsets();

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

  const authHeader = useMemo(() => {
    if (!webUser || !webPass) return undefined;
    const token = base64Encode(`${webUser}:${webPass}`);
    return `Basic ${token}`;
  }, [webUser, webPass]);

  const webSource = useMemo(() => {
    const authUrl =
      webUser && webPass ? withBasicAuthInUrl(webUrl, webUser, webPass) : webUrl;
    return authHeader
      ? { uri: authUrl, headers: { Authorization: authHeader } }
      : { uri: authUrl };
  }, [webUrl, authHeader, webUser, webPass]);

  const replyToWeb = (payload: Record<string, unknown>) => {
    webRef.current?.postMessage(JSON.stringify(payload));
  };

  const printFromJob = async (jobId: string) => {
    try {
      log(`Fetching print job ${jobId}`);
      const res = await fetch(
        `https://api.tillin.fr/api:nOth4UPY/print_receipt?job_id=${encodeURIComponent(
          jobId
        )}`
      );
      if (!res.ok) {
        log(`Xano error ${res.status}`);
        replyToWeb({ type: 'printResult', ok: false, id: jobId });
        return;
      }
      const json = (await res.json()) as { payloadBase64?: string };
      if (!json.payloadBase64) {
        log('Xano response missing payloadBase64');
        replyToWeb({ type: 'printResult', ok: false, id: jobId });
        return;
      }
      await Printer.printEscPosBase64(json.payloadBase64);
      log(`Printed job ${jobId}`);
      replyToWeb({ type: 'printResult', ok: true, id: jobId });
    } catch (e) {
      log(`Print job error: ${String(e)}`);
      replyToWeb({ type: 'printResult', ok: false, id: jobId });
    }
  };

  const handleWebMessage = async (raw: string) => {
    try {
      const data = JSON.parse(raw) as WebMessage;
      if (data.type === 'print') {
        const payload =
          data.payloadBase64 || data.base64 || data.payload || '';
        if (!payload) {
          replyToWeb({ type: 'printResult', ok: false, id: data.id });
          return;
        }
        if (data.payloadBase64 || data.base64) {
          await Printer.printEscPosBase64(payload);
        } else {
          await Printer.printEscPosText(payload, {
            encoding: data.encoding || 'cp858',
          });
        }
        replyToWeb({ type: 'printResult', ok: true, id: data.id });
      }
    } catch (e) {
      log(`WebView message error: ${String(e)}`);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={[styles.tabs, { paddingTop: insets.top + 6 }]}>
        <Button
          title="App"
          onPress={() => setMode('web')}
          color={mode === 'web' ? '#4aa3ff' : '#6b717c'}
        />
        <Button
          title="Printer"
          onPress={() => setMode('printer')}
          color={mode === 'printer' ? '#4aa3ff' : '#6b717c'}
        />
      </View>

      {mode === 'web' ? (
        <WebView
          ref={webRef}
          source={webSource}
          onMessage={event => handleWebMessage(event.nativeEvent.data)}
          onShouldStartLoadWithRequest={request => {
            const url = request.url || '';
            if (isPrintUrl(url)) {
              const jobId = getQueryParam(url, 'job_id');
              if (jobId) {
                void printFromJob(jobId);
              } else {
                log('Print URL missing job_id');
              }
              return false;
            }
            return true;
          }}
          onHttpError={event =>
            log(
              `HTTP error ${event.nativeEvent.statusCode} on ${event.nativeEvent.url}`
            )
          }
          onError={event =>
            log(`WebView error: ${event.nativeEvent.description}`)
          }
          originWhitelist={['https://*', 'http://*']}
          style={styles.web}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>Printer Setup</Text>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Web App</Text>
            <TextInput
              style={styles.input}
              value={webUrl}
              onChangeText={setWebUrl}
              placeholder="Web URL"
              autoCapitalize="none"
            />
            <View style={styles.spacer} />
            <TextInput
              style={styles.input}
              value={webUser}
              onChangeText={setWebUser}
              placeholder="Basic auth user"
              autoCapitalize="none"
            />
            <View style={styles.spacer} />
            <TextInput
              style={styles.input}
              value={webPass}
              onChangeText={setWebPass}
              placeholder="Basic auth password"
              secureTextEntry
            />
            <View style={styles.spacer} />
            <Button title="Open Web App" onPress={() => setMode('web')} />
          </View>

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
                <Button
                  title="Start BLE Scan"
                  onPress={() => Printer.startBleScan()}
                />
                <View style={styles.spacer} />
                <Button
                  title="Stop BLE Scan"
                  onPress={() => Printer.stopBleScan()}
                />
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
                    <Button
                      key={path}
                      title={path}
                      onPress={() => setUsbPath(path)}
                    />
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
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0f1012',
  },
  tabs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 4,
    backgroundColor: '#111318',
  },
  web: {
    flex: 1,
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

function base64Encode(input: string) {
  const utf8 = unescape(encodeURIComponent(input));
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';
  let i = 0;
  while (i < utf8.length) {
    const c1 = utf8.charCodeAt(i++);
    const c2 = utf8.charCodeAt(i++);
    const c3 = utf8.charCodeAt(i++);
    const e1 = c1 >> 2;
    const e2 = ((c1 & 3) << 4) | (c2 >> 4);
    let e3 = ((c2 & 15) << 2) | (c3 >> 6);
    let e4 = c3 & 63;
    if (isNaN(c2)) {
      e3 = 64;
      e4 = 64;
    } else if (isNaN(c3)) {
      e4 = 64;
    }
    output +=
      chars.charAt(e1) +
      chars.charAt(e2) +
      chars.charAt(e3) +
      chars.charAt(e4);
  }
  return output;
}

function withBasicAuthInUrl(url: string, user: string, pass: string) {
  const safeUser = encodeURIComponent(user);
  const safePass = encodeURIComponent(pass);
  const match = url.match(/^(https?:\/\/)(.+)$/);
  if (!match) return url;
  const prefix = match[1];
  const rest = match[2];
  if (rest.includes('@')) return url;
  return `${prefix}${safeUser}:${safePass}@${rest}`;
}

function isPrintUrl(url: string) {
  return /https?:\/\/([^@]+@)?app\.tillin\.fr\/print/i.test(url);
}

function getQueryParam(url: string, key: string) {
  try {
    const query = url.split('?')[1] || '';
    const pairs = query.split('&');
    for (const pair of pairs) {
      const [k, v] = pair.split('=');
      if (k === key) {
        return decodeURIComponent(v || '');
      }
    }
  } catch {
    return null;
  }
  return null;
}

export default App;
