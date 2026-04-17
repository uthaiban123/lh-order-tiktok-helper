const NAV_STATE_KEY = "lh-order-helper-report-nav";

function getCurrentUrl() {
  return `${window.location.pathname}${window.location.search}`;
}

function getSameOriginReferrerPath() {
  if (!document.referrer) {
    return "";
  }

  try {
    const referrerUrl = new URL(document.referrer);
    if (referrerUrl.origin !== window.location.origin) {
      return "";
    }

    return `${referrerUrl.pathname}${referrerUrl.search}`;
  } catch (error) {
    return "";
  }
}

function readNavState() {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(NAV_STATE_KEY) || "null");
    if (!parsed || !Array.isArray(parsed.stack)) {
      return { stack: [], index: -1 };
    }

    return {
      stack: parsed.stack.filter((item) => typeof item === "string" && item),
      index: Number.isInteger(parsed.index) ? parsed.index : -1,
    };
  } catch (error) {
    return { stack: [], index: -1 };
  }
}

function writeNavState(state) {
  window.sessionStorage.setItem(NAV_STATE_KEY, JSON.stringify(state));
}

function ensureNavState() {
  const currentUrl = getCurrentUrl();
  const state = readNavState();

  if (state.stack.length === 0) {
    const referrerPath = getSameOriginReferrerPath();
    const initialStack = referrerPath && referrerPath !== currentUrl
      ? [referrerPath, currentUrl]
      : [currentUrl];

    const initialState = {
      stack: initialStack,
      index: initialStack.length - 1,
    };

    writeNavState(initialState);
    return initialState;
  }

  if (state.stack[state.index] === currentUrl) {
    return state;
  }

  const normalizedIndex =
    state.index >= 0 && state.index < state.stack.length
      ? state.index
      : state.stack.length - 1;

  const nextStack = state.stack.slice(0, normalizedIndex + 1);
  if (nextStack[nextStack.length - 1] !== currentUrl) {
    nextStack.push(currentUrl);
  }

  const nextState = {
    stack: nextStack,
    index: nextStack.length - 1,
  };

  writeNavState(nextState);
  return nextState;
}

function navigateToHistory(targetIndex, fallbackUrl) {
  const state = readNavState();
  const targetUrl = state.stack[targetIndex];

  if (targetUrl) {
    writeNavState({
      stack: state.stack,
      index: targetIndex,
    });
    window.location.href = targetUrl;
    return;
  }

  if (fallbackUrl) {
    window.location.href = fallbackUrl;
  }
}

function updateHistoryButtons(state) {
  const backButton = document.querySelector("[data-nav-back]");
  const forwardButton = document.querySelector("[data-nav-forward]");

  if (backButton) {
    backButton.disabled = state.index <= 0;
  }

  if (forwardButton) {
    forwardButton.disabled = state.index >= state.stack.length - 1;
  }
}

document.querySelectorAll("[data-print-report]").forEach((button) => {
  button.addEventListener("click", () => {
    window.print();
  });
});

const navState = ensureNavState();
updateHistoryButtons(navState);

document.querySelector("[data-nav-back]")?.addEventListener("click", (event) => {
  const fallbackUrl = event.currentTarget.dataset.fallback || "/";
  navigateToHistory(readNavState().index - 1, fallbackUrl);
});

document.querySelector("[data-nav-forward]")?.addEventListener("click", () => {
  navigateToHistory(readNavState().index + 1, "");
});
