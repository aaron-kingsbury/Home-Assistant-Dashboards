import("/local/housevoice/browser-dashboard-frame.js?v=1");

const nonKioskSidebarPaths = new Set([
  "/calendar",
  "/graham-s-room",
  "/kids-rooms",
  "/my-floorplan",
  "/parents-room",
]);

const browserDashboardRoutes = new Map([
  ["/kids-rooms", "/cora-room-browser/0"],
  ["/parents-room", "/parents-room-browser/0"],
]);

document.addEventListener(
  "click",
  (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const eventPath = event.composedPath();
    const isSidebarLink = eventPath.some(
      (element) => element?.localName === "ha-sidebar",
    );
    const anchor = eventPath.find(
      (element) => element?.localName === "a" && element.href,
    );

    if (!isSidebarLink || !anchor) {
      return;
    }

    const destination = new URL(anchor.href, window.location.origin);
    const normalizedPath = destination.pathname.replace(/\/+$/, "") || "/";
    const matchedSidebarPath = [...nonKioskSidebarPaths].find(
      (path) => normalizedPath === path || normalizedPath.startsWith(`${path}/`),
    );

    if (
      destination.origin !== window.location.origin ||
      !matchedSidebarPath ||
      destination.searchParams.has("disable_km")
    ) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    const browserDashboardRoute = browserDashboardRoutes.get(matchedSidebarPath);
    if (browserDashboardRoute) {
      destination.pathname = browserDashboardRoute;
      destination.search = "";
      destination.hash = "";
    }

    destination.searchParams.set("disable_km", "");
    window.location.assign(destination.href);
  },
  true,
);
