import {
  type JSXElement,
  createContext,
  createEffect,
  onCleanup,
  untrack,
  useContext,
} from "solid-js";

import { ReactiveSet } from "@solid-primitives/set";

import {
  ACTION_PRIORITY,
  KeybindAction,
  PREVENT_DEFAULT,
  keybindFilter,
} from "./keybindActions";
import { platformSequences } from "./keybindSequences";

type KeybindContext = {
  createKeybind: (keybind: KeybindAction, callback: () => void) => void;
};

const keybindContext = createContext<KeybindContext>(null! as KeybindContext);

export function KeybindContext(props: { children: JSXElement }) {
  /**
   * Last event target, used for filtering
   */
  let target: HTMLElement | null;

  /**
   * Keep track of pressed keys to match sequences
   */
  const activeKeys = new ReactiveSet<string>();

  /**
   * Keep track of which keybinds are currently bound
   * to filter the firing keybindings list
   */
  const currentlyBound = ACTION_PRIORITY.reduce(
    (d, k) => ({ ...d, [k]: 0 }),
    {} as Record<KeybindAction, number>,
  );

  /**
   * Sequences for use
   */
  const sequences = platformSequences();

  /**
   * Get the currently firing keybind
   */
  function firing() {
    return (
      ACTION_PRIORITY
        // filter to those keybinds that are bound
        .filter((keybind) => currentlyBound[keybind])
        // apply custom filtering logic
        .filter((keybind) =>
          keybindFilter(keybind, activeKeys, currentlyBound, target),
        )
        // check whether the keybind is being pressed
        .filter((keybind) =>
          sequences[keybind].every((key) =>
            key instanceof RegExp
              ? [...activeKeys].findIndex((item) => key.test(item)) !== -1
              : activeKeys.has(key),
          ),
        )
        // return the highest priority keybind
        .shift()
    );
  }

  /**
   * Debug currently pressed sequences
   */
  if (import.meta.env.DEV) {
    createEffect(() =>
      console.debug(
        "[keybinds] Currently pressing",
        [...activeKeys],
        "which selects",
        ACTION_PRIORITY
          // filter to those keybinds that are bound
          .filter((keybind) => currentlyBound[keybind])
          // apply custom filtering logic
          .filter((keybind) =>
            keybindFilter(keybind, activeKeys, currentlyBound, target),
          )
          // check whether the keybind is being pressed
          .reduce(
            (d, keybind) => ({
              ...d,
              [keybind]: sequences[keybind].every((key) =>
                key instanceof RegExp
                  ? [...activeKeys].findIndex((item) => key.test(item)) !== -1
                  : activeKeys.has(key),
              ),
            }),
            {},
          ),
      ),
    );
  }

  /**
   * Check whether a given keybind fired
   * @param keybind Keybind
   */
  function isFired(keybind: KeybindAction) {
    return firing() === keybind;
  }

  /**
   * Handle key down event by adding it to active keys
   *
   * Sequences the browser also claims have to be cancelled here: the keybind
   * callbacks themselves run later from an effect, by which point the event is
   * long past and the address bar already has focus.
   */
  function onKeyDown(event: KeyboardEvent) {
    target = event.target as HTMLElement;
    activeKeys.add(event.key);

    const keybind = firing();
    if (keybind && PREVENT_DEFAULT.includes(keybind)) {
      event.preventDefault();
    }
  }

  /**
   * Handle key up event by removing it from active keys
   */
  function onKeyUp(event: KeyboardEvent) {
    target = event.target as HTMLElement;
    activeKeys.delete(event.key);
  }

  function onFocusDropped(_: FocusEvent) {
    activeKeys.clear();
  }

  document.body.addEventListener("keydown", onKeyDown);
  document.body.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onFocusDropped);

  onCleanup(() => {
    document.body.removeEventListener("keydown", onKeyDown);
    document.body.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onFocusDropped);
  });

  return (
    <keybindContext.Provider
      value={{
        createKeybind(keybind, callback) {
          currentlyBound[keybind]++;
          onCleanup(() => currentlyBound[keybind]--);

          createEffect(() => {
            const _ = [...activeKeys]; // track dependency
            if (isFired(keybind)) {
              untrack(callback);
            }
          });
        },
      }}
    >
      {props.children}
    </keybindContext.Provider>
  );
}

/**
 * Wrapper for contextual createKeybind function
 * @param keybind Keybind
 * @param callback Callback
 */
export function createKeybind(keybind: KeybindAction, callback: () => void) {
  const { createKeybind } = useContext(keybindContext);
  createKeybind(keybind, callback);
}

/**
 * Declarative keybind component
 */
export function Keybind(props: {
  keybind: KeybindAction;
  onPressed: () => void;
}) {
  createEffect(() => createKeybind(props.keybind, props.onPressed));
  return null;
}
