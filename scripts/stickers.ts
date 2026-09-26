/**
 * Copies the emoji offered as stickers from Twemoji (graphics CC-BY 4.0, by Twitter and
 * contributors) to public/stickers/, and writes the list the sticker panel reads.
 *
 *   bun scripts/stickers.ts
 */
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Grouped as the panel shows them. */
const GROUPS: Record<string, string> = {
	faces: '😀 😂 🤣 😊 😍 🥰 😘 😎 🤩 🥳 😇 🙂 😉 😋 😜 🤪 🤔 🤨 😐 😏 😬 🙄 😴 🤯 😱 😭 😢 🥺 😡 🤬 😤 😳 🥶 🥵 🤮 🤡 💀 👻 👽 🤖 😈 💩 🙈 🙉 🙊',
	hands: '👍 👎 👏 🙌 🙏 🤝 👋 ✌️ 🤞 🤟 🤘 👌 🤌 👈 👉 👆 👇 ☝️ ✊ 👊 💪 🫶 👀 🧠',
	hearts: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 💕 💖 💯 💢 💥 💫 💦 💨 💬 💭 💤',
	symbols: '🔥 ✨ ⭐ 🌟 ⚡ 🎉 🎊 🎁 🏆 🥇 👑 💎 💰 📌 📍 🎯 🚀 💡 🔔 🎵 🎶 ✅ ❌ ❗ ❓ ⚠️ 🚫 ⛔ 🆗 🆕 🔴 🟢 🔵 ⬆️ ⬇️ ⬅️ ➡️ ↗️ 🔄',
	nature: '☀️ 🌙 ⛅ 🌈 ❄️ 🌊 🌸 🌹 🌻 🌴 🍀 🍁 🐶 🐱 🦊 🐻 🐼 🐸 🐵 🦄 🐝 🦋 🐢 🐙',
	food: '🍕 🍔 🍟 🌮 🍩 🍪 🎂 🍦 🍿 ☕ 🍺 🍷 🥂 🍓 🍉 🥑',
	activities: '⚽ 🏀 🎮 🎬 📸 🎤 🎧 🎸 🎨 📚 💻 📱 ⏰ ✈️ 🚗 🏠',
};

const source = join(import.meta.dir, '..', 'node_modules', '@twemoji', 'svg');
const out = join(import.meta.dir, '..', 'public', 'stickers');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const file = (emoji: string, keepVariation: boolean) =>
	[...emoji]
		.map((char) => char.codePointAt(0)!.toString(16))
		.filter((code) => keepVariation || code !== 'fe0f')
		.join('-');

const list: Record<string, string[]> = {};
for (const [group, emojis] of Object.entries(GROUPS)) {
	list[group] = [];
	for (const emoji of emojis.split(' ')) {
		const name = [file(emoji, false), file(emoji, true)].find((candidate) => existsSync(join(source, `${candidate}.svg`)));
		if (!name) throw new Error(`No Twemoji for ${emoji}`);
		copyFileSync(join(source, `${name}.svg`), join(out, `${name}.svg`));
		list[group].push(name);
	}
}
writeFileSync(
	join(import.meta.dir, '..', 'src', 'editor', 'overlays', 'sticker-list.ts'),
	`// Written by scripts/stickers.ts.\nexport const STICKER_GROUPS = ${JSON.stringify(list, null, '\t')} as const;\n`,
);
console.log(Object.values(list).flat().length, 'stickers');
