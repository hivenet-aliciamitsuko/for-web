import { For, Show } from "solid-js";

import { Trans } from "@lingui/solid/macro";
import { cva } from "styled-system/css";
import { styled } from "styled-system/jsx";

import { KeybindAction, platformSequences } from "@revolt/keybinds";
import { Dialog, DialogProps, Text } from "@revolt/ui";

import { Modals } from "../types";

import { SHORTCUT_SECTIONS, displaySequence } from "./keybindDisplay";

/**
 * What each shortcut does, in the user's language
 *
 * Kept beside the list rather than on the action enum so the strings stay in
 * the app's translation catalogue, where every other user-facing string lives.
 */
function actionLabel(action: KeybindAction) {
  switch (action) {
    case KeybindAction.NAVIGATION_QUICK_SWITCHER:
      return <Trans>Jump to a conversation, channel or server</Trans>;
    case KeybindAction.NAVIGATION_CHANNEL_UP:
      return <Trans>Previous channel</Trans>;
    case KeybindAction.NAVIGATION_CHANNEL_DOWN:
      return <Trans>Next channel</Trans>;
    case KeybindAction.NAVIGATION_SERVER_UP:
      return <Trans>Previous server</Trans>;
    case KeybindAction.NAVIGATION_SERVER_DOWN:
      return <Trans>Next server</Trans>;
    case KeybindAction.CHAT_SEARCH:
      return <Trans>Search this channel</Trans>;
    case KeybindAction.CHAT_JUMP_END:
      return <Trans>Mark read and jump to the latest message</Trans>;
    case KeybindAction.CHAT_MARK_SERVER_AS_READ:
      return <Trans>Mark the whole server as read</Trans>;
    case KeybindAction.SHOW_SHORTCUTS:
      return <Trans>Show this list</Trans>;
    default:
      return null;
  }
}

/**
 * Heading for a group of shortcuts
 */
function sectionLabel(id: string) {
  switch (id) {
    case "navigation":
      return <Trans>Getting around</Trans>;
    case "chat":
      return <Trans>Reading</Trans>;
    default:
      return <Trans>General</Trans>;
  }
}

/**
 * Every keyboard shortcut, in one place
 *
 * Shortcuts that nobody can discover may as well not exist, and this is also
 * where someone arriving from another app finds out which of their reflexes
 * still work.
 */
export function ShortcutsModal(
  props: DialogProps & Modals & { type: "shortcuts" },
) {
  const sequences = platformSequences();

  return (
    <Dialog
      show={props.show}
      onClose={props.onClose}
      minWidth={460}
      title={<Trans>Keyboard shortcuts</Trans>}
      actions={[{ text: <Trans>Close</Trans> }]}
    >
      <div use:scrollable={{ direction: "y", class: sections() }}>
        <For each={SHORTCUT_SECTIONS}>
          {(section) => (
            <section>
              <SectionTitle class="label" size="small">
                {sectionLabel(section.id)}
              </SectionTitle>

              <For each={section.actions}>
                {(action) => (
                  <Show when={displaySequence(sequences[action])}>
                    {(keys) => (
                      <Shortcut>
                        <span>{actionLabel(action)}</span>
                        <Keys>
                          <For each={keys()}>{(key) => <Key>{key}</Key>}</For>
                        </Keys>
                      </Shortcut>
                    )}
                  </Show>
                )}
              </For>
            </section>
          )}
        </For>
      </div>

      <Note>
        <Trans>
          Typing any character focuses the message box. Hold Alt and click a
          channel or server to mark it read.
        </Trans>
      </Note>
    </Dialog>
  );
}

/**
 * Body of the sheet
 *
 * A nine row reference does not fit a short window however tightly it is set,
 * so this scrolls — but with the app's own thin themed bar rather than the
 * browser's, in a reserved gutter so it can never sit on top of the keycaps
 * and the list does not shift when it appears.
 */
const sections = cva({
  base: {
    gap: "var(--gap-md)",
    display: "flex",
    flexDirection: "column",

    maxHeight: "calc(100vh - 240px)",
    scrollbarGutter: "stable",
    paddingInlineEnd: "var(--gap-md)",
  },
});

const SectionTitle = styled(Text, {
  base: {
    display: "block",
    marginBlockEnd: "var(--gap-sm)",
    color: "var(--md-sys-color-primary)",
  },
});

const Shortcut = styled("div", {
  base: {
    gap: "var(--gap-lg)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: "28px",
    fontSize: "14px",
  },
});

const Keys = styled("div", {
  base: {
    gap: "4px",
    display: "flex",
    flexShrink: 0,
    alignItems: "center",
  },
});

/**
 * A single keycap
 */
const Key = styled("kbd", {
  base: {
    minWidth: "24px",
    padding: "3px 7px",

    fontSize: "12px",
    fontWeight: 600,
    fontFamily: "inherit",
    textAlign: "center",

    borderRadius: "var(--borderRadius-sm)",
    color: "var(--md-sys-color-on-surface)",
    background: "var(--md-sys-color-surface-container-highest)",
    boxShadow: "0 1px 0 var(--md-sys-color-outline-variant)",
  },
});

const Note = styled("p", {
  base: {
    margin: 0,
    fontSize: "13px",
    marginBlockStart: "var(--gap-md)",
    color: "var(--md-sys-color-outline)",
  },
});
