import { fetchBinary } from "../services/api";

export function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadTrack(url, fileName) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error("WAV conversion is not supported by this browser.");

  const context = new AudioContextClass();
  try {
    const source = await fetchBinary(url);
    const audio = await context.decodeAudioData(await source.arrayBuffer());
    const channelCount = Math.min(2, audio.numberOfChannels);
    const channels = Array.from({ length: channelCount }, (_, channel) => audio.getChannelData(channel));
    saveBlob(encodeWav(channels, audio.sampleRate), fileName);
  } finally {
    await context.close();
  }
}

function encodeWav(channels, sampleRate) {
  const channelCount = channels.length;
  const sampleCount = channels[0].length;
  const buffer = new ArrayBuffer(44 + sampleCount * channelCount * 2);
  const view = new DataView(buffer);
  const writeText = (offset, value) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));

  writeText(0, "RIFF");
  view.setUint32(4, 36 + sampleCount * channelCount * 2, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * 2, true);
  view.setUint16(32, channelCount * 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, sampleCount * channelCount * 2, true);

  let offset = 44;
  for (let sample = 0; sample < sampleCount; sample += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const value = Math.max(-1, Math.min(1, channels[channel][sample]));
      view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export async function downloadCombinedTracks(urls, fileName) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error("Combined audio is not supported by this browser.");

  const context = new AudioContextClass();
  try {
    const blobs = await Promise.all(urls.map(fetchBinary));
    const decoded = await Promise.all(blobs.map(async (blob) => context.decodeAudioData(await blob.arrayBuffer())));
    const channelCount = Math.min(2, Math.max(...decoded.map((audio) => audio.numberOfChannels)));
    const sampleCount = Math.max(...decoded.map((audio) => audio.length));
    const channels = Array.from({ length: channelCount }, () => new Float32Array(sampleCount));

    decoded.forEach((audio) => {
      channels.forEach((output, channel) => {
        const input = audio.getChannelData(Math.min(channel, audio.numberOfChannels - 1));
        for (let index = 0; index < input.length; index += 1) output[index] += input[index] / decoded.length;
      });
    });

    saveBlob(encodeWav(channels, context.sampleRate), fileName);
  } finally {
    await context.close();
  }
}
