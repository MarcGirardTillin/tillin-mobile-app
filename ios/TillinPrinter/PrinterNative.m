#import "PrinterNative.h"

#import <CoreBluetooth/CoreBluetooth.h>
#import "MBLEManager.h"
#import "MWIFIManager.h"
#import "PosCommand.h"

@interface PrinterNative () <MBLEManagerDelegate, MWIFIManagerDelegate>
@property (nonatomic, strong) MBLEManager *bleManager;
@property (nonatomic, strong) MWIFIManager *wifiManager;
@property (nonatomic, strong) NSArray<CBPeripheral *> *discoveredPeripherals;
@property (nonatomic, assign) BOOL bleConnected;
@property (nonatomic, assign) BOOL wifiConnected;
@property (nonatomic, copy) RCTPromiseResolveBlock pendingBleConnectResolve;
@property (nonatomic, copy) RCTPromiseRejectBlock pendingBleConnectReject;
@end

@implementation PrinterNative

RCT_EXPORT_MODULE(PrinterNative);

- (instancetype)init {
  if (self = [super init]) {
    _bleManager = [MBLEManager sharedInstance];
    _bleManager.delegate = self;
    _wifiManager = [MWIFIManager shareWifiManager];
    _wifiManager.delegate = self;
    _discoveredPeripherals = @[];
  }
  return self;
}

- (NSArray<NSString *> *)supportedEvents {
  return @[ @"PrinterBleDevices", @"PrinterBleState" ];
}

RCT_EXPORT_METHOD(initialize:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  resolve(@(YES));
}

RCT_EXPORT_METHOD(startBleScan) {
  [self.bleManager MstartScan];
}

RCT_EXPORT_METHOD(stopBleScan) {
  [self.bleManager MstopScan];
}

RCT_EXPORT_METHOD(connectBluetooth:(NSString *)uuid
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  CBPeripheral *target = nil;
  for (CBPeripheral *peripheral in self.discoveredPeripherals) {
    if ([[peripheral.identifier UUIDString] isEqualToString:uuid]) {
      target = peripheral;
      break;
    }
  }
  if (!target) {
    reject(@"E_BLE", @"Peripheral not found. Scan first.", nil);
    return;
  }
  self.pendingBleConnectResolve = resolve;
  self.pendingBleConnectReject = reject;
  [self.bleManager MconnectDevice:target];
}

RCT_EXPORT_METHOD(connectNetwork:(NSString *)host
                  port:(nonnull NSNumber *)port
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  UInt16 p = (UInt16)[port intValue];
  __weak typeof(self) weakSelf = self;
  [self.wifiManager MConnectWithHost:host port:p completion:^(BOOL isConnect) {
    if (isConnect) {
      weakSelf.wifiConnected = YES;
      resolve(@(YES));
    } else {
      weakSelf.wifiConnected = NO;
      reject(@"E_WIFI", @"Failed to connect to printer", nil);
    }
  }];
}

RCT_EXPORT_METHOD(disconnect:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  if (self.bleConnected) {
    [self.bleManager MdisconnectRootPeripheral];
    self.bleConnected = NO;
  }
  if (self.wifiConnected) {
    [self.wifiManager MDisConnect];
    self.wifiConnected = NO;
  }
  resolve(@(YES));
}

RCT_EXPORT_METHOD(printText:(NSString *)text
                  options:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  NSData *data = [self buildTextData:text options:options];
  [self sendData:data resolver:resolve rejecter:reject];
}

RCT_EXPORT_METHOD(printBarcode:(NSString *)content
                  options:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  NSData *data = [self buildBarcodeData:content options:options];
  [self sendData:data resolver:resolve rejecter:reject];
}

RCT_EXPORT_METHOD(printImage:(NSString *)base64
                  options:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  UIImage *image = [self imageFromBase64:base64];
  if (!image) {
    reject(@"E_IMAGE", @"Could not decode image", nil);
    return;
  }
  NSData *data = [self buildImageData:image options:options];
  [self sendData:data resolver:resolve rejecter:reject];
}

RCT_EXPORT_METHOD(printLocalLogo:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  UIImage *image = [UIImage imageNamed:@"printer_logo.jpg"];
  if (!image) {
    reject(@"E_IMAGE", @"printer_logo.jpg not found in bundle", nil);
    return;
  }
  NSData *data = [self buildImageData:image options:@{ @"paperWidth": @80, @"cut": @YES }];
  [self sendData:data resolver:resolve rejecter:reject];
}

RCT_EXPORT_METHOD(printEscPosText:(NSString *)raw
                  options:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  NSData *data = [self buildEscPosDataFromText:raw options:options];
  if (!data) {
    reject(@"E_ESC_POS", @"Failed to parse ESC/POS text", nil);
    return;
  }
  [self sendData:data resolver:resolve rejecter:reject];
}

RCT_EXPORT_METHOD(printEscPosSample:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  NSString *path = [[NSBundle mainBundle] pathForResource:@"esc_pos_exemple" ofType:@"txt"];
  if (!path) {
    reject(@"E_FILE", @"esc_pos_exemple.txt not found in bundle", nil);
    return;
  }
  NSError *error = nil;
  NSString *content = [NSString stringWithContentsOfFile:path encoding:NSUTF8StringEncoding error:&error];
  if (!content || error) {
    reject(@"E_FILE", @"Could not read esc_pos_exemple.txt", error);
    return;
  }
  NSData *data = [self buildEscPosDataFromText:content options:nil];
  if (!data) {
    reject(@"E_ESC_POS", @"Failed to parse ESC/POS sample", nil);
    return;
  }
  [self sendData:data resolver:resolve rejecter:reject];
}

#pragma mark - MBLEManagerDelegate

- (void)MdidUpdatePeripheralList:(NSArray *)peripherals RSSIList:(NSArray *)rssiList {
  self.discoveredPeripherals = peripherals ?: @[];
  NSMutableArray *payload = [NSMutableArray array];
  for (CBPeripheral *p in self.discoveredPeripherals) {
    [payload addObject:@{
      @"name": p.name ?: @"",
      @"uuid": p.identifier.UUIDString ?: @""
    }];
  }
  [self sendEventWithName:@"PrinterBleDevices" body:payload];
}

- (void)MdidConnectPeripheral:(CBPeripheral *)peripheral {
  self.bleConnected = YES;
  [self sendEventWithName:@"PrinterBleState" body:@{ @"connected": @YES }];
  if (self.pendingBleConnectResolve) {
    self.pendingBleConnectResolve(@(YES));
    self.pendingBleConnectResolve = nil;
    self.pendingBleConnectReject = nil;
  }
}

- (void)MdidFailToConnectPeripheral:(CBPeripheral *)peripheral error:(NSError *)error {
  self.bleConnected = NO;
  [self sendEventWithName:@"PrinterBleState" body:@{ @"connected": @NO }];
  if (self.pendingBleConnectReject) {
    self.pendingBleConnectReject(@"E_BLE", @"Failed to connect", error);
    self.pendingBleConnectReject = nil;
    self.pendingBleConnectResolve = nil;
  }
}

- (void)MdidDisconnectPeripheral:(CBPeripheral *)peripheral isAutoDisconnect:(BOOL)isAutoDisconnect {
  self.bleConnected = NO;
  [self sendEventWithName:@"PrinterBleState" body:@{ @"connected": @NO }];
}

- (void)MdidWriteValueForCharacteristic:(CBCharacteristic *)character error:(NSError *)error {
  // No-op: write callback handled by promise in sendData
}

#pragma mark - MWIFIManagerDelegate

- (void)MWIFIManager:(MWIFIManager *)manager didConnectedToHost:(NSString *)host port:(UInt16)port {
  self.wifiConnected = YES;
}

- (void)MWIFIManagerDidDisconnected:(MWIFIManager *)manager {
  self.wifiConnected = NO;
}

#pragma mark - Helpers

- (NSStringEncoding)encodingFromOptions:(NSDictionary *)options {
  NSString *encoding = options[@"encoding"];
  if (!encoding) {
    return NSUTF8StringEncoding;
  }
  NSString *lower = [encoding lowercaseString];
  if ([lower isEqualToString:@"gbk"] || [lower isEqualToString:@"gb18030"]) {
    return CFStringConvertEncodingToNSStringEncoding(kCFStringEncodingGB_18030_2000);
  }
  return NSUTF8StringEncoding;
}

- (NSData *)buildTextData:(NSString *)text options:(NSDictionary *)options {
  NSMutableData *data = [NSMutableData dataWithData:[MCommand initializePrinter]];
  NSNumber *align = options[@"align"];
  if (align) {
    [data appendData:[MCommand selectAlignment:align.intValue]];
  }
  NSNumber *widthMm = options[@"paperWidthMm"] ?: options[@"paperWidth"];
  int paperWidth = widthMm ? widthMm.intValue : 80;
  [data appendData:[MCommand setLableWidth:paperWidth]];
  NSNumber *printWidth = options[@"printAreaWidth"];
  int printArea = printWidth ? printWidth.intValue : 576;
  [data appendData:[MCommand setPrintAreaWidthWithnL:printArea % 256 andnH:printArea / 256]];
  [data appendData:[text dataUsingEncoding:[self encodingFromOptions:options]]];
  [data appendData:[MCommand printAndFeedLine]];
  if ([options[@"cut"] boolValue]) {
    [data appendData:[MCommand selectCutPageModelAndCutpageWithM:66 andN:1]];
  }
  return data;
}

- (NSData *)buildBarcodeData:(NSString *)content options:(NSDictionary *)options {
  NSMutableData *data = [NSMutableData dataWithData:[MCommand initializePrinter]];
  NSNumber *align = options[@"align"];
  if (align) {
    [data appendData:[MCommand selectAlignment:align.intValue]];
  }
  NSNumber *height = options[@"height"];
  if (height) {
    [data appendData:[MCommand setBarcodeHeight:height.intValue]];
  }
  NSNumber *width = options[@"width"];
  if (width) {
    [data appendData:[MCommand setBarcoeWidth:width.intValue]];
  }
  NSNumber *hri = options[@"hriPosition"];
  if (hri) {
    [data appendData:[MCommand selectHRICharactersPrintMition:hri.intValue]];
  }
  int type = options[@"type"] ? [options[@"type"] intValue] : 73;
  NSStringEncoding enc = [self encodingFromOptions:options];
  if (type >= 66) {
    [data appendData:[MCommand printBarcodeWithM:type andN:(int)content.length andContent:content useEnCodeing:enc]];
  } else {
    [data appendData:[MCommand printBarcodeWithM:type andContent:content useEnCodeing:enc]];
  }
  [data appendData:[MCommand printAndFeedLine]];
  if ([options[@"cut"] boolValue]) {
    [data appendData:[MCommand selectCutPageModelAndCutpageWithM:66 andN:1]];
  }
  return data;
}

- (NSData *)buildImageData:(UIImage *)image options:(NSDictionary *)options {
  NSMutableData *data = [NSMutableData dataWithData:[MCommand initializePrinter]];
  NSNumber *widthMm = options[@"paperWidthMm"] ?: options[@"paperWidth"];
  int paperWidth = widthMm ? widthMm.intValue : 80;
  [data appendData:[MCommand setLableWidth:paperWidth]];
  NSData *imgData = [MCommand printRasteBmpWithM:RasterNolmorWH andImage:image andType:Dithering andPaperHeight:1000];
  [data appendData:imgData];
  if ([options[@"cut"] boolValue]) {
    [data appendData:[MCommand selectCutPageModelAndCutpageWithM:66 andN:1]];
  }
  return data;
}

- (NSData *)buildEscPosDataFromText:(NSString *)raw options:(NSDictionary *)options {
  NSString *encoding = options[@"encoding"] ?: @"cp858";
  NSStringEncoding nsEncoding = NSUTF8StringEncoding;
  BOOL cp858Euro = NO;
  NSString *lower = [encoding lowercaseString];
  if ([lower isEqualToString:@"gbk"] || [lower isEqualToString:@"gb18030"]) {
    nsEncoding = CFStringConvertEncodingToNSStringEncoding(kCFStringEncodingGB_18030_2000);
  } else if ([lower isEqualToString:@"cp858"] || [lower isEqualToString:@"ibm858"] || [lower isEqualToString:@"ibm00858"]) {
    nsEncoding = CFStringConvertEncodingToNSStringEncoding(kCFStringEncodingDOSLatin1);
    cp858Euro = YES;
  } else if ([lower isEqualToString:@"cp850"] || [lower isEqualToString:@"ibm850"]) {
    nsEncoding = CFStringConvertEncodingToNSStringEncoding(kCFStringEncodingDOSLatin1);
  } else if ([lower isEqualToString:@"latin1"] || [lower isEqualToString:@"iso-8859-1"]) {
    nsEncoding = NSISOLatin1StringEncoding;
  }

  NSMutableData *data = [NSMutableData data];
  NSArray<NSString *> *lines = [raw componentsSeparatedByString:@"\n"];
  for (NSString *rawLine in lines) {
    NSString *line = [rawLine stringByTrimmingCharactersInSet:[NSCharacterSet characterSetWithCharactersInString:@"\r"]];
    NSRange commentRange = [line rangeOfString:@";"];
    NSString *content = commentRange.location != NSNotFound ? [line substringToIndex:commentRange.location] : line;
    NSString *trimmed = [content stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceCharacterSet]];
    if (trimmed.length == 0) {
      if (line.length == 0) {
        uint8_t lf = 0x0A;
        [data appendBytes:&lf length:1];
      }
      continue;
    }
    [self appendEscaped:trimmed encoding:nsEncoding cp858Euro:cp858Euro toData:data];
  }
  return data;
}

- (void)appendEscaped:(NSString *)text encoding:(NSStringEncoding)encoding cp858Euro:(BOOL)cp858Euro toData:(NSMutableData *)data {
  NSMutableString *normal = [NSMutableString string];
  NSUInteger i = 0;
  while (i < text.length) {
    unichar c = [text characterAtIndex:i];
    if (cp858Euro && c == 0x20AC) {
      if (normal.length > 0) {
        NSData *chunk = [normal dataUsingEncoding:encoding];
        [data appendData:chunk];
        [normal setString:@""];
      }
      uint8_t euro = 0xD5;
      [data appendBytes:&euro length:1];
      i += 1;
      continue;
    }
    if (c == '\\' && i + 1 < text.length) {
      unichar n = [text characterAtIndex:i + 1];
      if (n == 'x' && i + 3 < text.length) {
        NSString *hex = [text substringWithRange:NSMakeRange(i + 2, 2)];
        unsigned int value = 0;
        NSScanner *scanner = [NSScanner scannerWithString:hex];
        if ([scanner scanHexInt:&value]) {
          if (normal.length > 0) {
            NSData *chunk = [normal dataUsingEncoding:encoding];
            [data appendData:chunk];
            [normal setString:@""];
          }
          uint8_t b = (uint8_t)value;
          [data appendBytes:&b length:1];
          i += 4;
          continue;
        }
      } else if (n == 'n') {
        if (normal.length > 0) {
          NSData *chunk = [normal dataUsingEncoding:encoding];
          [data appendData:chunk];
          [normal setString:@""];
        }
        uint8_t lf = 0x0A;
        [data appendBytes:&lf length:1];
        i += 2;
        continue;
      } else if (n == 'r') {
        if (normal.length > 0) {
          NSData *chunk = [normal dataUsingEncoding:encoding];
          [data appendData:chunk];
          [normal setString:@""];
        }
        uint8_t cr = 0x0D;
        [data appendBytes:&cr length:1];
        i += 2;
        continue;
      } else if (n == 't') {
        if (normal.length > 0) {
          NSData *chunk = [normal dataUsingEncoding:encoding];
          [data appendData:chunk];
          [normal setString:@""];
        }
        uint8_t tab = 0x09;
        [data appendBytes:&tab length:1];
        i += 2;
        continue;
      } else if (n == '\\') {
        if (normal.length > 0) {
          NSData *chunk = [normal dataUsingEncoding:encoding];
          [data appendData:chunk];
          [normal setString:@""];
        }
        uint8_t slash = 0x5C;
        [data appendBytes:&slash length:1];
        i += 2;
        continue;
      }
    }
    [normal appendFormat:@"%C", c];
    i += 1;
  }
  if (normal.length > 0) {
    NSData *chunk = [normal dataUsingEncoding:encoding];
    [data appendData:chunk];
  }
}

- (UIImage *)imageFromBase64:(NSString *)base64 {
  NSString *clean = base64;
  NSRange commaRange = [base64 rangeOfString:@","];
  if (commaRange.location != NSNotFound) {
    clean = [base64 substringFromIndex:commaRange.location + 1];
  }
  NSData *data = [[NSData alloc] initWithBase64EncodedString:clean options:0];
  return [UIImage imageWithData:data];
}

- (void)sendData:(NSData *)data
       resolver:(RCTPromiseResolveBlock)resolve
       rejecter:(RCTPromiseRejectBlock)reject {
  if (!self.bleConnected && !self.wifiConnected) {
    reject(@"E_NOT_CONNECTED", @"Connect to a printer first", nil);
    return;
  }
  if (self.bleConnected) {
    [self.bleManager MWriteCommandWithData:data];
    resolve(@(YES));
    return;
  }
  [self.wifiManager MWriteCommandWithData:data];
  resolve(@(YES));
}

@end
