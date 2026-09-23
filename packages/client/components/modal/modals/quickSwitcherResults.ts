import type { Channel, Client, Server, User } from "stoat.js";

/**
 * Somewhere the switcher can take you
 */
export type QuickSwitcherResult =
  | { kind: "channel"; id: string; channel: Channel }
  | { kind: "server"; id: string; server: Server }
  | { kind: "user"; id: string; user: User };

/**
 * Filter the candidate list down to one kind of result
 *
 * Discord trains people to reach for these, and they are the only way to find
 * a channel whose name you know when it collides with a server of the same
 * name, so the sigils are worth carrying over.
 */
const SIGILS: Record<string, QuickSwitcherResult["kind"] | "conversation"> = {
  "#": "channel",
  "@": "conversation",
  "*": "server",
};

/**
 * How many entries to show at once
 *
 * Enough to be worth arrowing through, few enough that the dialog does not
 * become the whole screen.
 */
export const RESULT_LIMIT = 12;

/**
 * How many recent conversations to offer before anything is typed
 */
const RECENT_LIMIT = 8;

/**
 * A query split into its sigil and the text to actually match on
 */
export function parseQuery(input: string) {
  const trimmed = input.trim();
  const sigil = SIGILS[trimmed[0]];

  return {
    filter: sigil,
    query: (sigil ? trimmed.slice(1) : trimmed).toLowerCase(),
  };
}

/**
 * Position of `query` in `name` as a run of characters in order
 *
 * Returns the number of characters skipped over, so that a tighter match
 * ("gnl" in "general") outranks a looser one across the same name.
 * @returns Gap count, or undefined if the characters do not all appear in order
 */
function subsequenceGaps(name: string, query: string): number | undefined {
  let cursor = 0;
  let gaps = 0;
  let previous = -1;

  for (const character of query) {
    const at = name.indexOf(character, cursor);
    if (at === -1) return undefined;

    if (previous !== -1) gaps += at - previous - 1;
    previous = at;
    cursor = at + 1;
  }

  return gaps;
}

/**
 * How well a name answers the query
 *
 * The tiers are deliberately far apart: anything that matches from the start of
 * the name, or the start of a word within it, should beat every loose match
 * regardless of the bonuses applied on top.
 * @returns Score, or undefined if the name does not match at all
 */
export function matchScore(name: string, query: string): number | undefined {
  if (!query) return 0;

  const haystack = name.toLowerCase();

  if (haystack === query) return 1000;
  if (haystack.startsWith(query)) return 800;

  // start of any word inside the name, e.g. "gen" in "off-topic general"
  if (new RegExp(`[\\s\\-_/.]${escapeRegExp(query)}`).test(haystack))
    return 600;
  if (haystack.includes(query)) return 400;

  const gaps = subsequenceGaps(haystack, query);
  if (gaps === undefined) return undefined;

  return 200 - Math.min(gaps, 150);
}

/**
 * Escape a user-typed string for use inside a regular expression
 */
function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Narrow a result to one kind
 *
 * Written as a helper because a `<Match>` guard cannot narrow the union on its
 * own: the accessor it hands back is typed from the `when` expression.
 */
export function ofKind<K extends QuickSwitcherResult["kind"]>(
  result: QuickSwitcherResult,
  kind: K,
): Extract<QuickSwitcherResult, { kind: K }> | undefined {
  return result.kind === kind
    ? (result as Extract<QuickSwitcherResult, { kind: K }>)
    : undefined;
}

/**
 * Label the switcher matches against, and displays
 */
export function resultName(result: QuickSwitcherResult): string {
  switch (result.kind) {
    case "channel":
      // a channel's own displayName falls back to the recipient's *username*
      // for a direct message, so DM rows came out as lowercase handles while
      // friend rows used the proper display name
      return (
        result.channel.recipient?.displayName ??
        result.channel.displayName ??
        result.channel.name
      );
    case "server":
      return result.server.name;
    case "user":
      return result.user.displayName;
  }
}

/**
 * Where the result sits, shown after its name
 *
 * Server channels are the only ones that need it, and they need it badly: half
 * the servers you are in have a #general.
 */
export function resultContext(result: QuickSwitcherResult): string | undefined {
  return result.kind === "channel" ? result.channel.server?.name : undefined;
}

/**
 * Route the result navigates to
 */
export function resultHref(result: QuickSwitcherResult): string | undefined {
  switch (result.kind) {
    case "channel":
      return result.channel.serverId
        ? `/server/${result.channel.serverId}/channel/${result.channel.id}`
        : `/channel/${result.channel.id}`;
    case "server":
      return `/server/${result.server.id}`;
    case "user":
      // needs a DM channel opened first, so it has no static route
      return undefined;
  }
}

/**
 * Whether this result is a private conversation rather than a server channel
 */
function isConversation(channel: Channel) {
  return channel.type === "DirectMessage" || channel.type === "Group";
}

/**
 * Everything the switcher is allowed to offer
 *
 * Friends already holding an open DM are dropped, since that conversation is
 * itself a candidate and listing both would just be the same row twice.
 */
function candidates(client: Client, servers: Server[]): QuickSwitcherResult[] {
  const channels = client.channels
    .toList()
    .filter(
      (channel) =>
        channel.type === "Group" ||
        channel.type === "TextChannel" ||
        (channel.type === "DirectMessage" && channel.active),
    );

  const openConversations = new Set(
    channels
      .filter((channel) => channel.type === "DirectMessage")
      .map((channel) => channel.recipient?.id),
  );

  return [
    ...channels.map((channel) => ({
      kind: "channel" as const,
      id: channel.id,
      channel,
    })),
    ...servers.map((server) => ({
      kind: "server" as const,
      id: server.id,
      server,
    })),
    ...client.users
      .filter(
        (user) =>
          user.relationship === "Friend" && !openConversations.has(user.id),
      )
      .map((user) => ({ kind: "user" as const, id: user.id, user })),
  ];
}

/**
 * Nudges applied on top of the name match
 *
 * Small enough that they only ever reorder results within the same match tier —
 * an unread channel should not outrank the thing you actually typed the name of.
 */
function bonus(
  result: QuickSwitcherResult,
  recency: Map<string, number>,
): number {
  let score = 0;

  if (result.kind === "channel") {
    if (result.channel.unread) score += 30;
    if (result.channel.mentions?.size) score += 30;
    if (isConversation(result.channel)) score += 15;

    const rank = recency.get(result.channel.id);
    if (rank !== undefined) score += Math.max(0, 25 - rank * 2);
  }

  return score;
}

/**
 * Results to show for the given query
 *
 * With nothing typed this is the recent conversation list, which is what you
 * want the switcher for most of the time: the last few people you spoke to.
 * @param client Client
 * @param servers Servers, in the user's own order
 * @param conversations Active conversations, most recent first
 * @param recentChannelIds Channels opened recently, most recent first
 * @param input Raw contents of the search field
 */
export function quickSwitcherResults(
  client: Client,
  servers: Server[],
  conversations: Channel[],
  recentChannelIds: string[],
  input: string,
): QuickSwitcherResult[] {
  const { filter, query } = parseQuery(input);

  // channels you actually opened rank ahead of conversations that merely
  // received a message, since the switcher is for going back somewhere
  const recent = [
    ...recentChannelIds
      .map((id) => client.channels.get(id))
      .filter((channel): channel is Channel => !!channel),
    ...conversations,
  ].filter(
    (channel, index, all) =>
      all.findIndex((other) => other.id === channel.id) === index,
  );

  const recency = new Map(recent.map((channel, index) => [channel.id, index]));

  if (!query) {
    return recent.slice(0, RECENT_LIMIT).map((channel) => ({
      kind: "channel" as const,
      id: channel.id,
      channel,
    }));
  }

  return candidates(client, servers)
    .filter((result) => {
      switch (filter) {
        case undefined:
          return true;
        case "conversation":
          return (
            result.kind === "user" ||
            (result.kind === "channel" && isConversation(result.channel))
          );
        case "channel":
          return result.kind === "channel" && !isConversation(result.channel);
        default:
          return result.kind === filter;
      }
    })
    .map((result) => {
      const name = matchScore(resultName(result), query);

      // a server name is a weaker signal than the channel's own name, but it
      // still has to find "#general" for someone who typed the server instead
      const context = resultContext(result);
      const contextScore = context ? matchScore(context, query) : undefined;

      const score = Math.max(
        name ?? -Infinity,
        contextScore === undefined ? -Infinity : contextScore / 4,
      );

      return { result, score };
    })
    .filter((entry) => entry.score > -Infinity)
    .map((entry) => ({
      ...entry,
      score: entry.score + bonus(entry.result, recency),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        resultName(a.result).localeCompare(resultName(b.result)),
    )
    .slice(0, RESULT_LIMIT)
    .map((entry) => entry.result);
}
