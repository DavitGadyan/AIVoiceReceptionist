// Assembles raw/<name>.webm into out/<name>.mp4 with title/end cards and a cover jpg.
// `node post.mjs all` or `node post.mjs showreel`.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { OUT, RAW } from "./helpers.mjs";

const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const FFPROBE = process.env.FFPROBE ?? "ffprobe";
const TRIM = 1.0; // blank frames before the first paint
const TITLE = 2.5;
const END = 3.0;
const XF = 0.5;

const ORDER = ["showreel", "activity", "voice-demo", "pdf-config"];
const want = process.argv.slice(2);
const names = want.length === 0 || want.includes("all") ? ORDER : ORDER.filter((n) => want.includes(n));
const marks = existsSync(join(OUT, "marks.json")) ? JSON.parse(readFileSync(join(OUT, "marks.json"), "utf8")) : {};

const run = (bin, args) => execFileSync(bin, args, { stdio: ["ignore", "pipe", "inherit"] }).toString();
const duration = (file) =>
  parseFloat(run(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]));

for (const name of names) {
  const raw = join(RAW, `${name}.webm`);
  if (!existsSync(raw)) {
    console.error(`skip ${name}: ${raw} missing`);
    continue;
  }
  const body = join(OUT, `${name}.body.mp4`);
  const title = join(OUT, `title-${name}.png`);
  const end = join(OUT, "end.png");
  const final = join(OUT, `${name}.mp4`);

  // 1. body: trim, normalise fps/size/pixel format, encode once
  run(FFMPEG, ["-y", "-loglevel", "error", "-ss", String(TRIM), "-i", raw,
    "-vf", "fps=30,scale=1920:1080:flags=lanczos,format=yuv420p",
    "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-an", body]);
  const B = duration(body);

  // 2. title + body + end with 0.5 s crossfades, silent AAC track for picky players
  const off1 = TITLE - XF;
  const off2 = TITLE - XF + B - XF;
  run(FFMPEG, ["-y", "-loglevel", "error",
    "-loop", "1", "-t", String(TITLE), "-i", title,
    "-i", body,
    "-loop", "1", "-t", String(END), "-i", end,
    "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
    "-filter_complex",
    `[0:v]fps=30,format=yuv420p,settb=AVTB[a];[1:v]fps=30,format=yuv420p,settb=AVTB[b];[2:v]fps=30,format=yuv420p,settb=AVTB[c];` +
      `[a][b]xfade=transition=fade:duration=${XF}:offset=${off1.toFixed(3)}[ab];[ab][c]xfade=transition=fade:duration=${XF}:offset=${off2.toFixed(3)}[v]`,
    "-map", "[v]", "-map", "3:a", "-shortest",
    "-c:v", "libx264", "-crf", "18", "-preset", "slow", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", final]);

  // 3. cover frame: the scene's "cover" mark (raw seconds) → final timeline
  const m = marks[name]?.cover;
  const coverAt = m != null ? m - TRIM + (TITLE - XF) : TITLE + Math.min(8, B / 2);
  run(FFMPEG, ["-y", "-loglevel", "error", "-ss", coverAt.toFixed(2), "-i", final, "-frames:v", "1", "-q:v", "2", join(OUT, `${name}.jpg`)]);

  const info = run(FFPROBE, ["-v", "error", "-select_streams", "v:0", "-show_entries",
    "stream=codec_name,width,height,r_frame_rate,pix_fmt:format=duration", "-of", "default=nw=1", final]).trim().replace(/\n/g, " ");
  console.log(`✓ ${name}.mp4  ${info}  cover@${coverAt.toFixed(1)}s`);
}
