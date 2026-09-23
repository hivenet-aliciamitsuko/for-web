import { KeybindAction } from "@revolt/keybinds";

/**
 * How a key is written on a keycap, where that differs from its event name
 *
 * Only the keys our own sequences use; anything absent is shown as typed.
 */
const KEY_NAMES: Record<string, string> = {
  Control: "Ctrl",
  Meta: "⌘",
  Alt: "Alt",
  Shift: "Shift",
  Escape: "Esc",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Enter: "↵",
};

/**
 * Order modifiers are conventionally written in, ahead of the key itself
 */
const MODIFIER_ORDER = ["Control", "Meta", "Alt", "Shift"];

/**
 * A sequence rendered as the keys you actually press
 *
 * Sequences are stored as an unordered set of keys, so they have to be sorted
 * for display: "Shift+Ctrl+Esc" is the same binding as "Ctrl+Shift+Esc" but
 * only one of them reads as a shortcut.
 * @returns Key names in display order, or undefined if it cannot be written out
 */
export function displaySequence(
  sequence: (string | RegExp)[],
): string[] | undefined {
  // one binding matches any character rather than a named key; it is explained
  // in prose instead of being drawn as a keycap
  if (sequence.some((key) => key instanceof RegExp)) return undefined;

  return (sequence as string[])
    .toSorted((a, b) => {
      const left = MODIFIER_ORDER.indexOf(a);
      const right = MODIFIER_ORDER.indexOf(b);

      // non-modifiers sort last, in the order they were declared
      return (
        (left === -1 ? MODIFIER_ORDER.length : left) -
        (right === -1 ? MODIFIER_ORDER.length : right)
      );
    })
    .map(
      (key) => KEY_NAMES[key] ?? (key.length === 1 ? key.toUpperCase() : key),
    );
}

/**
 * Shortcuts worth listing, in the order they are shown
 *
 * Written out rather than derived from the action enum so that the list reads
 * as documentation: grouped by what you are trying to do, and skipping the
 * internal bindings (closing a floating element, cancelling an edit) that
 * nobody looks up.
 */
export const SHORTCUT_SECTIONS: {
  id: string;
  actions: KeybindAction[];
}[] = [
  {
    id: "navigation",
    actions: [
      KeybindAction.NAVIGATION_QUICK_SWITCHER,
      KeybindAction.NAVIGATION_CHANNEL_UP,
      KeybindAction.NAVIGATION_CHANNEL_DOWN,
      KeybindAction.NAVIGATION_SERVER_UP,
      KeybindAction.NAVIGATION_SERVER_DOWN,
    ],
  },
  {
    id: "chat",
    actions: [
      KeybindAction.CHAT_SEARCH,
      KeybindAction.CHAT_JUMP_END,
      KeybindAction.CHAT_MARK_SERVER_AS_READ,
    ],
  },
  {
    id: "general",
    actions: [KeybindAction.SHOW_SHORTCUTS],
  },
];
