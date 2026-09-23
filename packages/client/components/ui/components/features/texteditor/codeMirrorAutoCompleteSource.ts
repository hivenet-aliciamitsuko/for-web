import { Accessor, createMemo } from "solid-js";

import type {
  Completion,
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete";
import { User } from "stoat.js";

import { useClient } from "@revolt/client";
import {
  UNICODE_EMOJI_PACK_PUA,
  unicodeEmojiUrl,
} from "@revolt/markdown/emoji/UnicodeEmoji";
import { useState } from "@revolt/state";

import { AutoCompleteSearchSpace } from "../../utils/autoComplete";

import { EMOJI_KEYS, getEmojiByShorthand } from "@revolt/ui/emojis";
import { isInCodeBlock } from "./codeMirrorCommon";

const MAPPED_EMOJI_KEYS = EMOJI_KEYS.values()
  .toArray()
  .map(
    (id) =>
      ({
        type: "emoji",
        label: `:${id}:`,
        apply: getEmojiByShorthand(id)?.emoji,
      }) as Completion,
  );

/**
 * How far back to look for people who are actually talking
 */
const RECENT_SPEAKER_DEPTH = 60;

const RE_match = /(?<!\p{L}\w)[:@%#][\p{L}\w\-+]*/u;
const RE_mentionValidFor = /(?<!\p{L}\w)@[\p{L}\w\-+]*/u;
const RE_roleValidFor = /(?<!\p{L}\w)@[\p{L}\w\-+]*/u;
const RE_channelValidFor = /(?<!\p{L}\w)#[\p{L}\w\-+]*/u;

export function codeMirrorAutoCompleteSource(
  searchSpace: Accessor<AutoCompleteSearchSpace>,
) {
  const state = useState();
  const client = useClient();

  const emoji = createMemo(() => {
    return ([] as Completion[]).concat(
      MAPPED_EMOJI_KEYS.map((emoji) => ({
        ...emoji,
        apply: `${UNICODE_EMOJI_PACK_PUA[state.settings.getValue("appearance:unicode_emoji")!] ?? ""}${emoji.apply as string}`,
        url: unicodeEmojiUrl(
          state.settings.getValue("appearance:unicode_emoji"),
          emoji.apply as string,
        ),
      })),
      client().emojis.map((emoji) => ({
        type: "emoji",
        label: `:${emoji.name}:`,
        apply: `:${emoji.id}: `,
        url: emoji.url,
      })),
    );
  });

  /**
   * People who have spoken here recently, most recent first
   *
   * Without this, mentioning someone in a busy server means typing past four
   * strangers whose names happen to sort earlier — the completion list ends up
   * ranked by alphabet rather than by who you are actually talking to.
   * Message ids are ULIDs, so ordering by id is ordering by time.
   */
  const recentSpeakers = createMemo(() => {
    const channel = searchSpace()?.channel;
    const ranks = new Map<string, number>();
    if (!channel) return ranks;

    const recent = client()
      .messages.filter((message) => message.channelId === channel.id)
      .sort((a, b) => b.id.localeCompare(a.id))
      .slice(0, RECENT_SPEAKER_DEPTH);

    for (const message of recent) {
      const authorId = message.authorId;
      if (authorId && !ranks.has(authorId)) ranks.set(authorId, ranks.size);
    }

    return ranks;
  });

  const users = createMemo(() =>
    (
      searchSpace()?.members ??
      searchSpace()?.users ??
      client().users.toList()
    ).map((entry) => {
      // avoiding using `instanceof`, presumed slow
      const user = ((entry as { user: User })?.user ?? entry) as User;

      // Only hit the store once to reduce watchers.
      // If you need to access anything on the member more than once define a const here.
      const displayName = entry.displayName;
      const userName = user.username;
      const id = entry.id;
      const userId = typeof id === "string" ? id : id.user;

      const rank = recentSpeakers().get(userId);

      return {
        type: "user",
        label: ("@" + displayName).normalize("NFKC"),
        displayLabel: displayName,
        detail:
          displayName !== userName
            ? `${userName}#${user.discriminator}`
            : undefined,
        apply: `<@${userId}> `,
        url: entry.animatedAvatarURL,
        // stays within the range CodeMirror expects, and decays gently so a
        // strong name match can still overtake someone who spoke a while ago
        boost: rank === undefined ? undefined : Math.max(20, 90 - rank * 8),
      };
    }),
  );

  const roles = createMemo(() => {
    return (
      searchSpace()?.roles?.map(
        (entry) =>
          ({
            type: "role",
            label: ("%" + entry.name).normalize("NFKC"),
            displayLabel: entry.name,
            apply: `<%${entry.id}> `,
            colour: entry.colour,
          }) as Completion,
      ) ?? []
    );
  });

  const channels = createMemo(() =>
    (searchSpace()?.channels ?? client().channels.toList()).map(
      (entry) =>
        ({
          type: "channel",
          label: ("#" + entry.name).normalize("NFKC"),
          displayLabel: "#" + entry.name,
          apply: `<#${entry.id}> `,
        }) as Completion,
    ),
  );

  // eslint-disable-next-line solid/reactivity
  return (context: CompletionContext) => {
    if (isInCodeBlock(context.state, context.pos, context.pos)) {
      return null;
    }

    const token = context.matchBefore(RE_match);
    if (!token) return null;
    const normalizedText = token.text.normalize("NFKC");
    switch (normalizedText[0]) {
      case ":": {
        const text = normalizedText.slice(1);
        const allEmoji = emoji();

        const options = text
          ? allEmoji.map((option) =>
              option.label === `:${text}:` ? { ...option, boost: 1 } : option,
            )
          : allEmoji;

        return {
          from: token.from,
          options,
        } as CompletionResult;
      }
      case "@":
        return {
          from: token.from,
          options: users(),
          validFor: RE_mentionValidFor,
        } as CompletionResult;
      case "%":
        return {
          from: token.from,
          options: roles(),
          validFor: RE_roleValidFor,
        } as CompletionResult;
      case "#":
        return {
          from: token.from,
          options: channels(),
          validFor: RE_channelValidFor,
        } as CompletionResult;
      default:
        return null;
    }
  };
}
