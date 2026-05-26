function findNavigatorWithRoute(navigation, routeName) {
  let current = navigation;

  while (current) {
    const routeNames = current.getState?.()?.routeNames || [];
    if (routeNames.includes(routeName)) return current;
    current = current.getParent?.();
  }

  return null;
}

export function goToParentPortalStudentHome(navigation, child) {
  if (!child?.student_id) {
    if (navigation?.canGoBack?.()) {
      navigation.goBack();
      return true;
    }
    return false;
  }

  const parentStackNav = findNavigatorWithRoute(navigation, 'ChildStudentPortal');
  if (!parentStackNav?.navigate) return false;

  const selectionToken = Date.now();
  parentStackNav.navigate('ChildStudentPortal', {
    child,
    selectionToken,
    screen: 'HomeTab',
    params: {
      screen: 'StudentHome',
      params: { child, selectionToken },
    },
  });
  return true;
}

export function createParentPortalBackHandler(navigation, route) {
  const child = route?.params?.child || null;

  return () => {
    if (goToParentPortalStudentHome(navigation, child)) return;
    if (navigation?.canGoBack?.()) navigation.goBack();
  };
}