import { ErrorBoundary, For, Suspense } from "solid-js";

import { Trans } from "@lingui/solid/macro";
import { useMutation } from "@tanstack/solid-query";

import { useClient } from "@revolt/client";
import { createOwnBotsResource } from "@revolt/client/resources";
import { useModals } from "@revolt/modal";
import {
  Avatar,
  CategoryButton,
  CircularProgress,
  Column,
  iconSize,
} from "@revolt/ui";

import MdLibraryBooks from "@material-design-icons/svg/outlined/library_books.svg?component-solid";
import MdSmartToy from "@material-design-icons/svg/outlined/smart_toy.svg?component-solid";

import { useSettingsNavigation } from "../../Settings";

/**
 * Placeholder username given to a freshly created bot.
 *
 * Deliberately not translated: it is written to the server as the bot's real
 * username, so it must not depend on the creator's locale. It also has to
 * survive username validation, hence no space in it.
 */
const DEFAULT_BOT_USERNAME = "NewBot";

/**
 * View all owned bots
 */
export function MyBots() {
  return (
    <Column gap="lg">
      <CreateBot />
      <ListBots />
    </Column>
  );
}

/**
 * Prompt to create a new bot
 */
function CreateBot() {
  const client = useClient();
  const { showError } = useModals();
  const { navigate } = useSettingsNavigation();

  /**
   * Create a bot and open its editor straight away.
   *
   * Asking for a username in a modal first added a step for something the
   * editor already asks for, so the bot is created with a placeholder username
   * that the editor's own username field is there to replace.
   */
  const create = useMutation(() => ({
    mutationFn: () => client().bots.createBot(DEFAULT_BOT_USERNAME),
    onSuccess: (created) => navigate(`bots/${created.id}`),
    onError: showError,
  }));

  return (
    <CategoryButton.Group>
      <CategoryButton
        action="chevron"
        icon={<MdSmartToy {...iconSize(22)} />}
        onClick={() => {
          if (!create.isPending) create.mutate();
        }}
        description={
          <Trans>
            You agree that your bot is subject to the Acceptable Usage Policy.
          </Trans>
        }
      >
        <Trans>Create Bot</Trans>
      </CategoryButton>
      <CategoryButton
        action="external"
        icon={<MdLibraryBooks {...iconSize(22)} />}
        onClick={() => window.open("https://developers.stoat.chat", "_blank")}
        description={
          <Trans>Learn more about how to create bots on Stoat.</Trans>
        }
      >
        <Trans>Developer Documentation</Trans>
      </CategoryButton>
    </CategoryButton.Group>
  );
}

/**
 * List owned bots by current user
 */
function ListBots() {
  const { navigate } = useSettingsNavigation();
  const bots = createOwnBotsResource();

  return (
    <ErrorBoundary fallback="Failed to load bots...">
      <Suspense fallback={<CircularProgress />}>
        <CategoryButton.Group>
          <For each={bots.data}>
            {(bot) => (
              <CategoryButton
                icon={
                  <Avatar
                    src={bot.user!.animatedAvatarURL}
                    size={24}
                    fallback={bot.user!.displayName}
                  />
                }
                onClick={() => navigate(`bots/${bot.id}`)}
                action="chevron"
                // description={bot.id}
              >
                {bot.user!.displayName}
              </CategoryButton>
            )}
          </For>
        </CategoryButton.Group>
      </Suspense>
    </ErrorBoundary>
  );
}
