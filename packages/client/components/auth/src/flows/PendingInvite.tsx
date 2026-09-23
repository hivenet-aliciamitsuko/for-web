import { Match, Show, Switch, createMemo, createResource } from "solid-js";

import { Trans } from "@lingui/solid/macro";
import { PublicChannelInvite, ServerPublicInvite } from "stoat.js";
import { styled } from "styled-system/jsx";

import { useApi, useClient } from "@revolt/client";
import { useState } from "@revolt/state";
import { Avatar } from "@revolt/ui";

/**
 * Invite code the visitor arrived with, if any
 *
 * Landing on /invite/… while logged out stores the path and bounces to the
 * login screen, so this is where the intent survives.
 */
function pendingInviteCode(path: string | undefined) {
  return path?.match(/^\/invite\/([^/?#]+)/)?.[1];
}

/**
 * What the visitor was invited to, shown above the authentication flows
 *
 * Without this, following a friend's invite link lands you on a generic pitch
 * for a product you have never heard of, with nothing to say which community
 * you were actually being asked to join — the single worst moment in the
 * whole sign-up path, and the one every new person goes through.
 */
export function PendingInvite() {
  const state = useState();
  const api = useApi();
  const client = useClient();

  const code = createMemo(() => pendingInviteCode(state.layout.peekNextPath()));

  const [invite] = createResource(code, async (code) => {
    // the invite route is public, which is the whole reason this can be shown
    // before there is an account to authenticate with
    const response = await api.get(`/invites/${code as ""}`);
    return PublicChannelInvite.from(client(), response);
  });

  /**
   * The invite, once known to be one we can describe
   *
   * Guarded on the resource state rather than read directly: calling the
   * accessor while the request is in error re-throws it, which takes the whole
   * authentication page down with it — and a dead invite link is exactly the
   * case this component exists to handle gracefully.
   */
  const server = createMemo(() => {
    if (invite.state !== "ready") return undefined;

    const value = invite();
    return value instanceof ServerPublicInvite ? value : undefined;
  });

  return (
    <Show when={code()}>
      <Switch>
        {/* deliberately blank while loading: a spinner above the login form
            draws the eye away from it for the fraction of a second it takes */}
        <Match when={invite.state === "pending"}>{null}</Match>
        <Match when={invite.state === "errored"}>
          <Card>
            <Details>
              <Title wrap>
                <Trans>This invite has expired</Trans>
              </Title>
              <Body>
                <Trans>
                  Ask whoever sent it for a new link. You can still sign in
                  below.
                </Trans>
              </Body>
            </Details>
          </Card>
        </Match>
        <Match when={invite.state === "ready" && server()}>
          {(invite) => (
            <Card>
              <Avatar
                size={44}
                shape="rounded-square"
                src={invite().serverIcon?.previewUrl}
                fallback={invite().serverName}
              />
              <Details>
                <Subtitle>
                  <Trans>{invite().userName} invited you to</Trans>
                </Subtitle>
                <Title>{invite().serverName}</Title>
                <Subtitle>
                  <Trans>
                    {invite().memberCount.toLocaleString()} members · #
                    {invite().channelName}
                  </Trans>
                </Subtitle>
              </Details>
            </Card>
          )}
        </Match>
      </Switch>
    </Show>
  );
}

const Card = styled("div", {
  base: {
    gap: "var(--gap-md)",
    display: "flex",
    alignItems: "center",

    padding: "var(--gap-md)",
    borderRadius: "var(--borderRadius-lg)",
    color: "var(--md-sys-color-on-surface)",
    background: "var(--md-sys-color-surface-container-high)",
  },
});

const Details = styled("div", {
  base: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
  },
});

/**
 * Name of the thing being joined
 *
 * Clipped to one line by default so a long server name cannot push the card
 * out of shape, but allowed to wrap where the text is a sentence rather than
 * a name.
 */
const Title = styled("span", {
  base: {
    fontWeight: 700,
    fontSize: "1.05em",
  },
  variants: {
    wrap: {
      false: {
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
      },
    },
  },
  defaultVariants: {
    wrap: false,
  },
});

/**
 * Explanatory sentence, which has to wrap
 *
 * The metadata line below clips to one line; prose given the same treatment
 * loses the half of the sentence that tells you what to do next.
 */
const Body = styled("span", {
  base: {
    fontSize: "0.85em",
    lineHeight: 1.35,
    marginBlockStart: "2px",
    color: "var(--md-sys-color-outline)",
  },
});

const Subtitle = styled("span", {
  base: {
    fontSize: "0.85em",
    color: "var(--md-sys-color-outline)",

    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  },
});
