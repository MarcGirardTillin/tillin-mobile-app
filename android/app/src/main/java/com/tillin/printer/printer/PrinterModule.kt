package com.tillin.printer.printer

import android.bluetooth.BluetoothAdapter
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.graphics.BitmapFactory
import android.os.IBinder
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.UiThreadUtil
import net.posprinter.posprinterface.IMyBinder
import net.posprinter.posprinterface.ProcessData
import net.posprinter.posprinterface.UiExecute
import net.posprinter.service.PosprinterService
import net.posprinter.utils.BitmapToByteData
import net.posprinter.utils.DataForSendToPrinterPos80
import net.posprinter.utils.PosPrinterDev
import java.nio.charset.Charset
import java.util.concurrent.CopyOnWriteArrayList
import java.io.BufferedReader
import java.io.InputStreamReader

class PrinterModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private var binder: IMyBinder? = null
  private var isBound = false
  private var isConnected = false
  private val pendingReady = CopyOnWriteArrayList<Promise>()

  private val serviceConnection = object : ServiceConnection {
    override fun onServiceConnected(name: ComponentName, service: IBinder) {
      binder = service as IMyBinder
      isBound = true
      pendingReady.forEach { it.resolve(true) }
      pendingReady.clear()
    }

    override fun onServiceDisconnected(name: ComponentName) {
      binder = null
      isBound = false
    }
  }

  init {
    bindServiceIfNeeded()
  }

  override fun getName(): String = "PrinterNative"

  override fun onCatalystInstanceDestroy() {
    super.onCatalystInstanceDestroy()
    if (isBound) {
      reactContext.unbindService(serviceConnection)
      isBound = false
    }
  }

  @ReactMethod
  fun initialize(promise: Promise) {
    if (binder != null) {
      promise.resolve(true)
      return
    }
    pendingReady.add(promise)
    bindServiceIfNeeded()
  }

  @ReactMethod
  fun getBondedBluetoothDevices(promise: Promise) {
    val adapter = BluetoothAdapter.getDefaultAdapter()
    if (adapter == null) {
      promise.resolve(Arguments.createArray())
      return
    }
    val array = Arguments.createArray()
    for (device in adapter.bondedDevices) {
      val map = Arguments.createMap()
      map.putString("name", device.name)
      map.putString("address", device.address)
      array.pushMap(map)
    }
    promise.resolve(array)
  }

  @ReactMethod
  fun listUsbDevices(promise: Promise) {
    val devices = PosPrinterDev.GetUsbPathNames(reactContext)
    val array = Arguments.createArray()
    devices?.forEach { array.pushString(it) }
    promise.resolve(array)
  }

  @ReactMethod
  fun connectBluetooth(address: String, promise: Promise) {
    withBinder(promise) { binder ->
      binder.connectBtPort(
        address,
        uiCallback(
          promise,
          onSuccess = { isConnected = true },
          onFail = { isConnected = false }
        )
      )
    }
  }

  @ReactMethod
  fun connectUsb(usbPath: String, promise: Promise) {
    withBinder(promise) { binder ->
      binder.connectUsbPort(
        reactContext,
        usbPath,
        uiCallback(
          promise,
          onSuccess = { isConnected = true },
          onFail = { isConnected = false }
        )
      )
    }
  }

  @ReactMethod
  fun connectNetwork(host: String, port: Int, promise: Promise) {
    withBinder(promise) { binder ->
      binder.connectNetPort(
        host,
        port,
        uiCallback(
          promise,
          onSuccess = { isConnected = true },
          onFail = { isConnected = false }
        )
      )
    }
  }

  @ReactMethod
  fun disconnect(promise: Promise) {
    withBinder(promise) { binder ->
      binder.disconnectCurrentPort(
        uiCallback(
          promise,
          onSuccess = { isConnected = false },
          onFail = { isConnected = false }
        )
      )
    }
  }

  @ReactMethod
  fun printText(text: String, options: ReadableMap?, promise: Promise) {
    if (!ensureConnected(promise)) return
    withBinder(promise) { binder ->
      val charset = options?.getString("encoding") ?: "UTF-8"
      DataForSendToPrinterPos80.setCharsetName(charset)
      val align = options?.getInt("align") ?: -1
      val cut = options?.getBoolean("cut") ?: false
      binder.writeDataByYouself(uiCallback(promise), ProcessData {
        val list = ArrayList<ByteArray>()
        list.add(DataForSendToPrinterPos80.initializePrinter())
        if (align >= 0) {
          list.add(DataForSendToPrinterPos80.selectAlignment(align))
        }
        list.add(text.toByteArray(Charset.forName(charset)))
        list.add(DataForSendToPrinterPos80.printAndFeedLine())
        if (cut) {
          list.add(DataForSendToPrinterPos80.selectCutPagerModerAndCutPager(66, 1))
        }
        list
      })
    }
  }

  @ReactMethod
  fun printBarcode(content: String, options: ReadableMap?, promise: Promise) {
    if (!ensureConnected(promise)) return
    withBinder(promise) { binder ->
      val type = options?.getInt("type") ?: 73
      val height = options?.getInt("height") ?: 162
      val width = options?.getInt("width") ?: 3
      val hri = options?.getInt("hriPosition") ?: 2
      val align = options?.getInt("align") ?: -1
      val cut = options?.getBoolean("cut") ?: false
      binder.writeDataByYouself(uiCallback(promise), ProcessData {
        val list = ArrayList<ByteArray>()
        list.add(DataForSendToPrinterPos80.initializePrinter())
        if (align >= 0) {
          list.add(DataForSendToPrinterPos80.selectAlignment(align))
        }
        list.add(DataForSendToPrinterPos80.selectHRICharacterPrintPosition(hri))
        list.add(DataForSendToPrinterPos80.setBarcodeWidth(width))
        list.add(DataForSendToPrinterPos80.setBarcodeHeight(height))
        if (type >= 65) {
          list.add(DataForSendToPrinterPos80.printBarcode(type, content.length, content))
        } else {
          list.add(DataForSendToPrinterPos80.printBarcode(type, content))
        }
        list.add(DataForSendToPrinterPos80.printAndFeedLine())
        if (cut) {
          list.add(DataForSendToPrinterPos80.selectCutPagerModerAndCutPager(66, 1))
        }
        list
      })
    }
  }

  @ReactMethod
  fun printImage(base64: String, options: ReadableMap?, promise: Promise) {
    if (!ensureConnected(promise)) return
    withBinder(promise) { binder ->
      val clean = base64.substringAfter("base64,", base64)
      val bytes = Base64.decode(clean, Base64.DEFAULT)
      val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
      if (bitmap == null) {
        promise.reject("E_IMAGE", "Could not decode image")
        return@withBinder
      }
      val paperWidth = options?.getInt("paperWidth") ?: 576
      val align = options?.getString("align") ?: "center"
      val alignType = when (align.lowercase()) {
        "left" -> BitmapToByteData.AlignType.Left
        "right" -> BitmapToByteData.AlignType.Right
        else -> BitmapToByteData.AlignType.Center
      }
      val cut = options?.getBoolean("cut") ?: false
      binder.writeDataByYouself(uiCallback(promise), ProcessData {
        val list = ArrayList<ByteArray>()
        list.add(DataForSendToPrinterPos80.initializePrinter())
        list.add(
          DataForSendToPrinterPos80.printRasterBmp(
            0,
            bitmap,
            BitmapToByteData.BmpType.Dithering,
            alignType,
            paperWidth
          )
        )
        if (cut) {
          list.add(DataForSendToPrinterPos80.selectCutPagerModerAndCutPager(66, 1))
        }
        list
      })
    }
  }

  @ReactMethod
  fun printEscPosText(raw: String, options: ReadableMap?, promise: Promise) {
    if (!ensureConnected(promise)) return
    withBinder(promise) { binder ->
      val encoding = options?.getString("encoding") ?: "cp858"
      val bytes = parseEscPos(raw, encoding)
      binder.write(bytes, uiCallback(promise))
    }
  }

  @ReactMethod
  fun printEscPosBase64(base64: String, promise: Promise) {
    if (!ensureConnected(promise)) return
    withBinder(promise) { binder ->
      val clean = base64.substringAfter("base64,", base64)
      val bytes = Base64.decode(clean, Base64.DEFAULT)
      binder.write(bytes, uiCallback(promise))
    }
  }

  @ReactMethod
  fun printEscPosSample(promise: Promise) {
    if (!ensureConnected(promise)) return
    val text = readAssetText("esc_pos_exemple.txt")
    if (text == null) {
      promise.reject("E_FILE", "esc_pos_exemple.txt not found in assets")
      return
    }
    val opts = Arguments.createMap().apply { putString("encoding", "cp858") }
    printEscPosText(text, opts, promise)
  }

  @ReactMethod
  fun printLocalLogo(promise: Promise) {
    if (!ensureConnected(promise)) return
    withBinder(promise) { binder ->
      val resId = reactContext.resources.getIdentifier(
        "printer_logo",
        "drawable",
        reactContext.packageName
      )
      if (resId == 0) {
        promise.reject("E_IMAGE", "printer_logo drawable not found")
        return@withBinder
      }
      val bitmap = BitmapFactory.decodeResource(reactContext.resources, resId)
      if (bitmap == null) {
        promise.reject("E_IMAGE", "Could not decode printer_logo")
        return@withBinder
      }
      binder.writeDataByYouself(uiCallback(promise), ProcessData {
        val list = ArrayList<ByteArray>()
        list.add(DataForSendToPrinterPos80.initializePrinter())
        list.add(
          DataForSendToPrinterPos80.printRasterBmp(
            0,
            bitmap,
            BitmapToByteData.BmpType.Dithering,
            BitmapToByteData.AlignType.Center,
            576
          )
        )
        list.add(DataForSendToPrinterPos80.selectCutPagerModerAndCutPager(66, 1))
        list
      })
    }
  }

  private fun bindServiceIfNeeded() {
    if (isBound) return
    val intent = Intent(reactContext, PosprinterService::class.java)
    reactContext.bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)
  }

  private fun withBinder(promise: Promise, block: (IMyBinder) -> Unit) {
    val current = binder
    if (current == null) {
      promise.reject("E_NOT_READY", "Printer service not connected. Call initialize() first.")
      return
    }
    block(current)
  }

  private fun ensureConnected(promise: Promise): Boolean {
    if (!isConnected) {
      promise.reject("E_NOT_CONNECTED", "No active printer connection")
      return false
    }
    return true
  }

  private fun readAssetText(name: String): String? {
    return try {
      val stream = reactContext.assets.open(name)
      val reader = BufferedReader(InputStreamReader(stream, Charsets.UTF_8))
      reader.use { it.readText() }
    } catch (e: Exception) {
      null
    }
  }

  private fun parseEscPos(input: String, encoding: String): ByteArray {
    val bytes = ArrayList<Byte>()
    val (charset, cp858Euro) = resolveCharset(encoding)
    val lines = input.split("\n")
    for (rawLine in lines) {
      val line = rawLine.trimEnd('\r')
      val commentIndex = line.indexOf(';')
      val content = if (commentIndex >= 0) line.substring(0, commentIndex) else line
      val trimmed = content.trimEnd()
      if (trimmed.isEmpty()) {
        // Preserve blank lines as a line feed
        if (line.isEmpty()) {
          bytes.add(0x0A)
        }
        continue
      }
      appendEscaped(trimmed, charset, cp858Euro, bytes)
    }
    return bytes.toByteArray()
  }

  private fun appendEscaped(
    text: String,
    charset: Charset,
    cp858Euro: Boolean,
    out: MutableList<Byte>
  ) {
    val normal = StringBuilder()
    fun flush() {
      if (normal.isNotEmpty()) {
        out.addAll(normal.toString().toByteArray(charset).toList())
        normal.setLength(0)
      }
    }
    var i = 0
    while (i < text.length) {
      val c = text[i]
      if (cp858Euro && c == '€') {
        flush()
        out.add(0xD5.toByte())
        i += 1
        continue
      }
      if (c == '\\' && i + 1 < text.length) {
        val n = text[i + 1]
        when (n) {
          'x' -> {
            if (i + 3 < text.length) {
              val hex = text.substring(i + 2, i + 4)
              flush()
              try {
                out.add(hex.toInt(16).toByte())
                i += 4
                continue
              } catch (_: NumberFormatException) {
                // fall through
              }
            }
          }
          'n' -> {
            flush()
            out.add(0x0A)
            i += 2
            continue
          }
          'r' -> {
            flush()
            out.add(0x0D)
            i += 2
            continue
          }
          't' -> {
            flush()
            out.add(0x09)
            i += 2
            continue
          }
          '\\' -> {
            flush()
            out.add(0x5C)
            i += 2
            continue
          }
        }
      }
      normal.append(c)
      i += 1
    }
    flush()
  }

  private fun resolveCharset(encoding: String): Pair<Charset, Boolean> {
    val lower = encoding.lowercase()
    return when (lower) {
      "cp858", "ibm858", "ibm00858" -> Charset.forName("IBM850") to true
      "cp850", "ibm850" -> Charset.forName("IBM850") to false
      "latin1", "iso-8859-1" -> Charset.forName("ISO-8859-1") to false
      else -> Charset.forName(encoding) to false
    }
  }

  private fun uiCallback(
    promise: Promise,
    onSuccess: (() -> Unit)? = null,
    onFail: (() -> Unit)? = null
  ): UiExecute {
    return object : UiExecute {
      override fun onsucess() {
        UiThreadUtil.runOnUiThread {
          onSuccess?.invoke()
          promise.resolve(true)
        }
      }

      override fun onfailed() {
        UiThreadUtil.runOnUiThread {
          onFail?.invoke()
          promise.reject("E_PRINTER", "Operation failed")
        }
      }
    }
  }
}
