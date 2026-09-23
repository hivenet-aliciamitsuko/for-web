import {
  For,
  JSX,
  Match,
  Show,
  Switch,
  createMemo,
  createSignal,
} from "solid-js";

import { Trans, useLingui } from "@lingui/solid/macro";
import { useQuery } from "@tanstack/solid-query";
import { API, Channel } from "stoat.js";
import { styled } from "styled-system/jsx";
import { encodeTime } from "ulid";

import { Message } from "@revolt/app";
import { CircularProgress } from "@revolt/ui";
import { Symbol } from "@revolt/ui/components/utils/Symbol";

/**
 * Lowest and highest randomness a ULID can carry, in Crockford base32.
 */
const ULID_RANDOM_MIN = "0".repeat(16);
const ULID_RANDOM_MAX = "Z".repeat(16);

/**
 * Turn a yyyy-mm-dd value from a date input into a message id boundary.
 *
 * The search route has no date filter, but `before`/`after` take message ids,
 * and ids are ULIDs which encode their own creation time. Pairing an encoded
 * timestamp with all-zero randomness lands before every message of that
 * millisecond, all-Z lands after every one of them.
 */
function dateBoundary(value: string, edge: "start" | "end") {
  if (!value) return undefined;

  const time = new Date(
    edge === "start" ? `${value}T00:00:00` : `${value}T23:59:59.999`,
  ).getTime();
  if (Number.isNaN(time)) return undefined;

  return (
    encodeTime(time, 10) +
    (edge === "start" ? ULID_RANDOM_MIN : ULID_RANDOM_MAX)
  );
}

/**
 * Ways results can be ordered, in the order they are offered
 *
 * Latest first: looking for something said recently is what people actually
 * come to a channel search for.
 */
const SORTS: {
  value: API.DataMessageSearch["sort"];
  label: () => JSX.Element;
}[] = [
  { value: "Latest", label: () => <Trans>Latest</Trans> },
  { value: "Oldest", label: () => <Trans>Oldest</Trans> },
  { value: "Relevance", label: () => <Trans>Relevant</Trans> },
];

/**
 * Message search sidebar
 */
export function TextSearchSidebar(props: {
  channel: Channel;
  query: Omit<API.DataMessageSearch, "include_users">;
}) {
  const { t } = useLingui();

  const [sort, setSort] = createSignal<API.DataMessageSearch["sort"]>("Latest");
  const [after, setAfter] = createSignal("");
  const [before, setBefore] = createSignal("");
  const [showDates, setShowDates] = createSignal(false);

  /**
   * The pinned list reuses this sidebar with a fixed sort; its results are not
   * meant to be narrowed further, so the controls belong to search only.
   */
  const filterable = () => !props.query.sort;

  /** Whether there is anything to search for yet */
  const hasQuery = () => !filterable() || !!props.query.query?.trim();

  /** Whether a date filter is currently narrowing the results */
  const datesActive = () => !!after() || !!before();

  const params = createMemo(() => {
    const params: Omit<API.DataMessageSearch, "include_users"> = {
      ...props.query,
    };

    if (!props.query.sort) params.sort = sort();

    const from = dateBoundary(after(), "start");
    const until = dateBoundary(before(), "end");
    if (from) params.after = from;
    if (until) params.before = until;

    return params;
  });

  /** Dates the user entered the wrong way round, which can only match nothing */
  const impossibleRange = createMemo(() => {
    const from = dateBoundary(after(), "start");
    const until = dateBoundary(before(), "end");
    return !!from && !!until && from > until;
  });

  const query = useQuery(() => ({
    queryKey: ["search", props.channel.id, params()],
    queryFn: () =>
      props.channel.searchWithUsers(params()).then((result) => result.messages),
    // an empty box would otherwise fetch the whole channel and spin forever
    enabled: hasQuery(),
  }));

  return (
    <>
      <Show when={filterable()}>
        {/* the panel's own padding, so the controls line up with the title
            above them and the fields stop short of the panel edge */}
        <Controls>
          <Tabs>
            <For each={SORTS}>
              {(option) => (
                <Tab
                  active={sort() === option.value}
                  onClick={() => setSort(option.value)}
                >
                  {option.label()}
                </Tab>
              )}
            </For>

            {/* the date fields are most of this panel's height and are wanted
                about once a month, so they stay folded away until asked for */}
            <DateToggle
              active={showDates() || datesActive()}
              onClick={() => setShowDates((shown) => !shown)}
              use:floating={{
                tooltip: { placement: "bottom", content: t`Filter by date` },
              }}
            >
              <Symbol size={18}>date_range</Symbol>
              <Show when={datesActive()}>
                <ActiveDot />
              </Show>
            </DateToggle>
          </Tabs>

          <Show when={showDates()}>
            <Dates>
              <Field>
                <FieldLabel>
                  <Trans>After</Trans>
                </FieldLabel>
                <DateInput
                  type="date"
                  value={after()}
                  onInput={(e) => setAfter(e.currentTarget.value)}
                />
              </Field>
              <Field>
                <FieldLabel>
                  <Trans>Before</Trans>
                </FieldLabel>
                <DateInput
                  type="date"
                  value={before()}
                  onInput={(e) => setBefore(e.currentTarget.value)}
                />
              </Field>
            </Dates>
          </Show>

          <Show when={impossibleRange()}>
            <Notice>
              <Trans>That date range starts after it ends.</Trans>
            </Notice>
          </Show>
        </Controls>
      </Show>

      <Switch>
        <Match when={!hasQuery()}>
          <Placeholder>
            <Symbol size={28}>search</Symbol>
            <Trans>Type in the box above to search this channel.</Trans>
          </Placeholder>
        </Match>
        <Match when={query.isPending}>
          <Placeholder>
            <CircularProgress />
          </Placeholder>
        </Match>
        <Match when={query.isError}>
          <Placeholder>
            <Symbol size={28}>error_outline</Symbol>
            <Trans>Something went wrong searching this channel.</Trans>
          </Placeholder>
        </Match>
        <Match when={!query.data?.length}>
          <Placeholder>
            <Symbol size={28}>search_off</Symbol>
            <Trans>No messages matched.</Trans>
          </Placeholder>
        </Match>
        <Match when={query.data}>
          {(messages) => (
            <>
              <Count>
                <Trans>{messages().length} results</Trans>
              </Count>
              <For each={messages()}>
                {(message) => (
                  <Result href={message.path}>
                    <Message message={message} isLink />
                  </Result>
                )}
              </For>
            </>
          )}
        </Match>
      </Switch>
    </>
  );
}

/**
 * Everything above the results, sharing the panel's inline padding
 */
const Controls = styled("div", {
  base: {
    // 12px between rows: at 4px the date fields read as attached to the tabs
    gap: "var(--gap-l)",
    display: "flex",
    flexDirection: "column",

    // matches the padding of the panel title directly above
    paddingInline: "var(--gap-md)",
    paddingBlockEnd: "var(--gap-l)",
    borderBottom: "1px solid var(--md-sys-color-surface-container-highest)",
  },
});

const Tabs = styled("div", {
  base: {
    gap: "var(--gap-lg)",
    display: "flex",
    alignItems: "center",
  },
});

/**
 * One sort option
 *
 * Quiet text rather than a filled button: how results are ordered is a
 * preference you set once, not the three most important actions on screen.
 */
const Tab = styled("a", {
  base: {
    cursor: "pointer",
    fontSize: "13px",
    paddingBlock: "6px",
    whiteSpace: "nowrap",
    borderBottom: "2px solid transparent",
    transition: "var(--transitions-fast) all",
  },
  variants: {
    active: {
      true: {
        fontWeight: 600,
        color: "var(--md-sys-color-primary)",
        borderBottomColor: "var(--md-sys-color-primary)",
      },
      false: {
        fontWeight: 500,
        color: "var(--md-sys-color-outline)",
        _hover: { color: "var(--md-sys-color-on-surface)" },
      },
    },
  },
});

/**
 * Reveals the date fields, pushed to the far end of the row
 */
const DateToggle = styled("a", {
  base: {
    flexShrink: 0,
    position: "relative",
    marginInlineStart: "auto",

    width: "26px",
    height: "26px",
    display: "grid",
    placeItems: "center",

    cursor: "pointer",
    // every control in this panel is one step of the shape scale; blocks of
    // content are the next one up, and nothing else invents its own
    borderRadius: "var(--borderRadius-sm)",
    transition: "var(--transitions-fast) all",
  },
  variants: {
    active: {
      true: {
        color: "var(--md-sys-color-primary)",
        background: "var(--md-sys-color-surface-container-highest)",
      },
      false: {
        color: "var(--md-sys-color-outline)",
        _hover: {
          color: "var(--md-sys-color-on-surface)",
          background: "var(--md-sys-color-surface-container-highest)",
        },
      },
    },
  },
});

/**
 * Marks a date filter still narrowing results while folded away
 */
const ActiveDot = styled("div", {
  base: {
    top: "2px",
    right: "2px",
    position: "absolute",

    width: "5px",
    height: "5px",
    borderRadius: "var(--borderRadius-full)",
    background: "var(--md-sys-color-primary)",
  },
});

const Dates = styled("div", {
  base: {
    gap: "var(--gap-md)",
    display: "flex",

    "& > *": {
      flex: "1 1 0",
      minWidth: 0,
    },
  },
});

const Field = styled("label", {
  base: {
    gap: "2px",
    display: "flex",
    flexDirection: "column",
  },
});

const FieldLabel = styled("span", {
  base: {
    fontSize: "11px",
    color: "var(--md-sys-color-outline)",
  },
});

/**
 * Compact date entry
 *
 * A plain input rather than the Material field used elsewhere: that one is
 * 56px tall with a floating label and a full-width underline, which is more
 * furniture than the whole rest of this panel put together.
 */
const DateInput = styled("input", {
  base: {
    width: "100%",
    height: "28px",
    minWidth: 0,

    border: "none",
    fontSize: "12px",
    fontFamily: "inherit",
    paddingInline: "var(--gap-md)",
    borderRadius: "var(--borderRadius-sm)",
    color: "var(--md-sys-color-on-surface)",
    background: "var(--md-sys-color-surface-container-highest)",

    _focus: {
      outline: "1px solid var(--md-sys-color-primary)",
    },

    "&::-webkit-calendar-picker-indicator": {
      cursor: "pointer",
      opacity: 0.5,
      _hover: { opacity: 1 },
    },
  },
});

const Notice = styled("div", {
  base: {
    fontSize: "12px",
    color: "var(--md-sys-color-error)",
  },
});

/**
 * Number of matches, so the list reads as an answer rather than a feed
 */
const Count = styled("div", {
  base: {
    fontSize: "12px",
    padding: "var(--gap-l) var(--gap-md) var(--gap-sm)",
    color: "var(--md-sys-color-outline)",
  },
});

/**
 * Empty, loading and error states, which all sit in the same place
 */
const Placeholder = styled("div", {
  base: {
    gap: "var(--gap-md)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",

    padding: "56px var(--gap-lg)",
    fontSize: "13px",
    textAlign: "center",
    color: "var(--md-sys-color-outline)",
    fill: "var(--md-sys-color-outline)",
  },
});

const Result = styled("a", {
  base: {
    display: "block",
    borderRadius: "var(--borderRadius-md)",

    _hover: {
      background: "var(--md-sys-color-surface-container-high)",
    },
  },
});
