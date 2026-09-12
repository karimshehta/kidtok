import { NativeModules, Platform } from 'react-native'

type NativeKidTokVideoTools = {
  trim?: (uri: string, startMs: number, endMs: number) => Promise<string>
}

const nativeVideoTools = NativeModules.KidTokVideoTools as NativeKidTokVideoTools | undefined

export async function trimVideoSegment(
  uri: string,
  startMs: number,
  endMs: number
): Promise<string> {
  if (Platform.OS === 'android') {
    if (!nativeVideoTools?.trim) {
      throw new Error('Native Android video trim module is not available in this build.')
    }
    return nativeVideoTools.trim(uri, startMs, endMs)
  }

  const { trim } = require('react-native-video-trim') as {
    trim: (uri: string, options: { startTime: number; endTime: number; outputExt?: string }) => Promise<string>
  }

  return trim(uri, {
    startTime: startMs,
    endTime: endMs,
    outputExt: 'mp4',
  })
}
