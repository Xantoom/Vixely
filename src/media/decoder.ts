/**
 * Decoding starts this much before a cut point so the decoder settles first: Opus, AAC and MP3
 * all need some audio before a point to rebuild their state, and would otherwise start quiet or
 * distorted. What is decoded before the point is dropped.
 */
export const DECODER_PREROLL = 0.5;
