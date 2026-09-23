import {
  For,
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
  createSignal,
  on,
} from "solid-js";

import { Trans, useLingui } from "@lingui/solid/macro";
import { styled } from "styled-system/jsx";

import { useClient } from "@revolt/client";
import { useNavigate } from "@revolt/routing";
import { useState } from "@revolt/state";
import { Avatar, Dialog, DialogProps, MenuButton, TextField } from "@revolt/ui";
import { Symbol } from "@revolt/ui/components/utils/Symbol";

import { useModals } from "..";
import { Modals } from "../types";

import {
  type QuickSwitcherResult,
  ofKind,
  quickSwitcherResults,
  resultContext,
  resultHref,
  resultName,
} from "./quickSwitcherResults";

/**
 * Jump to any conversation, channel or server by name
 *
 * The one shortcut people arriving from Discord press without thinking, and
 * the only way to navigate a large account without hunting through sidebars.
 */
export function QuickSwitcherModal(
  props: DialogProps & Modals & { type: "quick_switcher" },
) {
  const { t } = useLingui();
  const client = useClient();
  const state = useState();
  const navigate = useNavigate();
  const { showError } = useModals();

  const [query, setQuery] = createSignal("");
  const [highlighted, setHighlighted] = createSignal(0);

  let list: HTMLDivElement | undefined;

  const results = createMemo(() =>
    quickSwitcherResults(
      client(),
      state.ordering.orderedServers(client()),
      state.ordering.orderedConversations(client()),
      state.layout.recentChannels(),
      query(),
    ),
  );

  /**
   * Highlighted entry, kept inside the list as it shrinks under the cursor
   */
  const selected = createMemo(() =>
    Math.min(highlighted(), Math.max(0, results().length - 1)),
  );

  // a new query is a new list, so start from the top of it again
  createEffect(on(query, () => setHighlighted(0)));

  // keep the highlight visible when it is arrowed past the fold
  createEffect(
    on(selected, (index) => {
      list?.children[index]?.scrollIntoView({ block: "nearest" });
    }),
  );

  /**
   * Move the highlight, wrapping around at both ends
   */
  function move(by: number) {
    const { length } = results();
    if (!length) return;

    setHighlighted((selected() + by + length) % length);
  }

  /**
   * Go to a result and dismiss the switcher
   *
   * A friend without an open conversation has no route to navigate to, so the
   * direct message has to be created before we know where we are going.
   */
  async function open(result: QuickSwitcherResult) {
    const href = resultHref(result);

    if (href) {
      navigate(href);
      props.onClose();
      return;
    }

    if (result.kind !== "user") return;

    try {
      const channel = await result.user.openDM();
      navigate(`/channel/${channel.id}`);
      props.onClose();
    } catch (error) {
      showError(error);
    }
  }

  /**
   * Drive the list from the search field, so typing never loses focus
   *
   * Tab moves the highlight like the arrows do, matching Discord; the event is
   * stopped so the dialog's own focus trap does not also act on it.
   */
  function onKeyDown(event: KeyboardEvent) {
    switch (event.key) {
      case "ArrowDown":
        move(1);
        break;
      case "ArrowUp":
        move(-1);
        break;
      case "Tab":
        move(event.shiftKey ? -1 : 1);
        break;
      case "Enter": {
        const result = results()[selected()];
        if (!result) return;
        open(result);
        break;
      }
      default:
        return;
    }

    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <Dialog
      show={props.show}
      onClose={props.onClose}
      minWidth={560}
      padding={16}
    >
      <Search onKeyDown={onKeyDown}>
        <TextField
          variant="outlined"
          placeholder={t`Where would you like to go?`}
          value={query()}
          onInput={(event) => setQuery(event.currentTarget.value)}
        />

        <Results ref={list}>
          <For each={results()}>
            {(result, index) => (
              <MenuButton
                size="compact"
                attention={index() === selected() ? "selected" : "normal"}
                alert={
                  result.kind === "channel" &&
                  result.channel.unread &&
                  (result.channel.mentions?.size || true)
                }
                icon={<ResultIcon result={result} />}
                onClick={() => open(result)}
                onMouseEnter={() => setHighlighted(index())}
              >
                <Label>
                  <Name>{resultName(result)}</Name>
                  <Show when={resultContext(result)}>
                    {(context) => <Context>{context()}</Context>}
                  </Show>
                </Label>
              </MenuButton>
            )}
          </For>

          <Show when={!results().length}>
            <Empty>
              <Trans>Nothing matches that.</Trans>
            </Empty>
          </Show>
        </Results>

        <Hint>
          <Trans>
            <strong>#</strong> channels · <strong>@</strong> people ·{" "}
            <strong>*</strong> servers
          </Trans>
        </Hint>
      </Search>
    </Dialog>
  );
}

/**
 * Icon shown against a result, matching how the same entry looks in the sidebar
 */
function ResultIcon(props: { result: QuickSwitcherResult }) {
  return (
    <Switch>
      <Match when={ofKind(props.result, "server")}>
        {(result) => (
          <Avatar
            size={24}
            shape="rounded-square"
            src={result().server.iconURL}
            fallback={result().server.name}
          />
        )}
      </Match>
      <Match when={ofKind(props.result, "user")}>
        {(result) => (
          <Avatar
            size={24}
            src={result().user.avatarURL}
            fallback={result().user.displayName}
          />
        )}
      </Match>
      <Match when={ofKind(props.result, "channel")}>
        {(result) => (
          <Switch fallback={<Symbol>grid_3x3</Symbol>}>
            <Match when={result().channel.type === "Group"}>
              <Avatar
                size={24}
                shape="rounded-square"
                src={result().channel.iconURL}
                fallback={result().channel.name}
                primaryContrast
              />
            </Match>
            <Match when={result().channel.type === "DirectMessage"}>
              <Avatar
                size={24}
                src={result().channel.iconURL}
                fallback={result().channel.displayName}
              />
            </Match>
            {/* conversations report themselves as voice too, since they can be
                called, so this only reaches actual voice channels */}
            <Match when={result().channel.isVoice}>
              <Symbol>headset_mic</Symbol>
            </Match>
          </Switch>
        )}
      </Match>
    </Switch>
  );
}

const Search = styled("div", {
  base: {
    gap: "var(--gap-md)",
    display: "flex",
    flexDirection: "column",
  },
});

/**
 * Scrolling list of matches
 *
 * Tall enough to show the whole recent list without the dialog resizing every
 * time a character is typed.
 */
const Results = styled("div", {
  base: {
    gap: "2px",
    display: "flex",
    flexDirection: "column",

    maxHeight: "336px",
    overflowY: "auto",

    // the rows are sidebar buttons, which carry their own outer margin
    marginInline: "calc(var(--gap-md) * -1)",
  },
});

const Label = styled("div", {
  base: {
    gap: "var(--gap-md)",
    display: "flex",
    alignItems: "baseline",
    minWidth: 0,
  },
});

const Name = styled("span", {
  base: {
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  },
});

/**
 * Server a channel belongs to
 *
 * Follows the row's own colour rather than picking its own: the highlighted row
 * inverts, and a fixed grey disappears into it.
 */
const Context = styled("span", {
  base: {
    flexShrink: 0,
    opacity: 0.6,
    fontSize: "12px",
    color: "var(--color)",
  },
});

const Empty = styled("div", {
  base: {
    margin: "auto",
    padding: "24px",
    fontSize: "14px",
    color: "var(--md-sys-color-outline-variant)",
  },
});

const Hint = styled("div", {
  base: {
    fontSize: "12px",
    textAlign: "center",
    color: "var(--md-sys-color-outline-variant)",
  },
});
