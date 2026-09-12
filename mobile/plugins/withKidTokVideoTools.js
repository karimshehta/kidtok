const { withDangerousMod, withMainApplication } = require('@expo/config-plugins')
const fs = require('fs')
const path = require('path')

const moduleSource = `package com.kidtok.app

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.media.MediaMuxer
import android.net.Uri
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.nio.ByteBuffer
import kotlin.math.max

class KidTokVideoToolsModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "KidTokVideoTools"

  @ReactMethod
  fun trim(inputUri: String, startMsDouble: Double, endMsDouble: Double, promise: Promise) {
    try {
      if (inputUri.isBlank()) {
        promise.reject("E_VIDEO_TRIM_INVALID_FILE", "Input video URI is empty")
        return
      }

      val startUs = max(0L, startMsDouble.toLong() * 1000L)
      val endUs = max(startUs + 1000L, endMsDouble.toLong() * 1000L)
      val outputFile = File.createTempFile("kidtok_trim_", ".mp4", reactContext.cacheDir)

      trimWithMuxer(inputUri, outputFile, startUs, endUs)
      promise.resolve(outputFile.absolutePath)
    } catch (throwable: Throwable) {
      promise.reject(
        "E_VIDEO_TRIM_FAILED",
        throwable.message ?: throwable.javaClass.simpleName,
        throwable
      )
    }
  }

  private fun trimWithMuxer(inputUri: String, outputFile: File, startUs: Long, endUs: Long) {
    val uri = Uri.parse(inputUri)
    val extractor = MediaExtractor()
    var muxer: MediaMuxer? = null

    try {
      extractor.setDataSource(reactContext, uri, null)

      val trackMap = HashMap<Int, Int>()
      var maxInputSize = 0

      val mediaMuxer = MediaMuxer(outputFile.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
      muxer = mediaMuxer
      readRotation(inputUri)?.let { mediaMuxer.setOrientationHint(it) }

      for (trackIndex in 0 until extractor.trackCount) {
        val format = extractor.getTrackFormat(trackIndex)
        val mime = format.getString(MediaFormat.KEY_MIME) ?: continue
        if (!mime.startsWith("video/") && !mime.startsWith("audio/")) continue

        extractor.selectTrack(trackIndex)
        val muxerTrackIndex = mediaMuxer.addTrack(format)
        trackMap[trackIndex] = muxerTrackIndex

        if (format.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE)) {
          maxInputSize = max(maxInputSize, format.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE))
        }
      }

      if (trackMap.isEmpty()) {
        throw IllegalStateException("No audio/video tracks found")
      }

      if (maxInputSize <= 0) maxInputSize = 4 * 1024 * 1024
      val buffer = ByteBuffer.allocateDirect(maxInputSize)
      val bufferInfo = MediaCodec.BufferInfo()

      mediaMuxer.start()
      extractor.seekTo(startUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)

      while (true) {
        val sampleTrackIndex = extractor.sampleTrackIndex
        if (sampleTrackIndex < 0) break

        val muxerTrackIndex = trackMap[sampleTrackIndex]
        if (muxerTrackIndex == null) {
          extractor.advance()
          continue
        }

        val sampleTime = extractor.sampleTime
        if (sampleTime < 0 || sampleTime > endUs) break

        buffer.clear()
        val sampleSize = extractor.readSampleData(buffer, 0)
        if (sampleSize < 0) break

        bufferInfo.set(
          0,
          sampleSize,
          max(0L, sampleTime - startUs),
          extractor.sampleFlags
        )
        mediaMuxer.writeSampleData(muxerTrackIndex, buffer, bufferInfo)
        extractor.advance()
      }
    } finally {
      try {
        muxer?.stop()
      } catch (_: Throwable) {
      }
      try {
        muxer?.release()
      } catch (_: Throwable) {
      }
      try {
        extractor.release()
      } catch (_: Throwable) {
      }
    }
  }

  private fun readRotation(inputUri: String): Int? {
    val retriever = MediaMetadataRetriever()
    return try {
      retriever.setDataSource(reactContext, Uri.parse(inputUri))
      retriever
        .extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)
        ?.toIntOrNull()
        ?.takeIf { it == 0 || it == 90 || it == 180 || it == 270 }
    } catch (_: Throwable) {
      null
    } finally {
      try {
        retriever.release()
      } catch (_: Throwable) {
      }
    }
  }
}
`

const packageSource = `package com.kidtok.app

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class KidTokVideoToolsPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(KidTokVideoToolsModule(reactContext))
  }

  override fun createViewManagers(
    reactContext: ReactApplicationContext
  ): List<ViewManager<*, *>> {
    return emptyList()
  }
}
`

function withKidTokVideoTools(config) {
  config = withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const appDir = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'java',
        'com',
        'kidtok',
        'app'
      )
      fs.mkdirSync(appDir, { recursive: true })
      fs.writeFileSync(path.join(appDir, 'KidTokVideoToolsModule.kt'), moduleSource)
      fs.writeFileSync(path.join(appDir, 'KidTokVideoToolsPackage.kt'), packageSource)
      return modConfig
    },
  ])

  return withMainApplication(config, (modConfig) => {
    const src = modConfig.modResults.contents
    const addLine = '          add(KidTokVideoToolsPackage())'

    if (!src.includes(addLine)) {
      modConfig.modResults.contents = src.replace(
        '          // add(MyReactNativePackage())',
        `          // add(MyReactNativePackage())\n${addLine}`
      )
    }

    return modConfig
  })
}

module.exports = withKidTokVideoTools
