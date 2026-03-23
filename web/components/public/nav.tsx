// --------------------------------------------------------------------------------------
// Navigation Bar System (Mobile + Desktop)
// --------------------------------------------------------------------------------------
// This file defines a data-driven navigation bar for both mobile and desktop layouts.
// To extend: update the `navigationItems` array with new links or sections.
// Components:
//   - Navigation: Root bar with logo, mobile, and desktop nav.
//   - MobileNav: Hamburger menu for small screens.
//   - DesktopNav: Horizontal menu for larger screens.
// --------------------------------------------------------------------------------------

import { Link } from "react-router";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { cn } from "@/lib/utils";
import { NavDrawer } from "@/components/shared/NavDrawer";

interface NavItem {
  type: "item";
  title: string;
  href: string;
  description?: string; // (optional, shown in desktop dropdowns)
}
interface NavSection {
  type: "section";
  title: string;
  items: NavItem[];
}
type NavItems = (NavItem | NavSection)[];

// Main navigation data. Tabs + “buy signals” for the marketing page.
const navigationItems: NavItems = [
  {
    type: "item",
    title: "Product",
    href: "/#product",
    description: "Overview of how Strata runs your shop.",
  },
  {
    type: "item",
    title: "Features",
    href: "/#features",
    description: "Calendar, CRM, invoices, inventory, and more.",
  },
  {
    type: "item",
    title: "Who it’s for",
    href: "/#industries",
    description: "Detailers, tinters, wrap shops, mechanics.",
  },
  {
    type: "item",
    title: "Pricing",
    href: "/#pricing",
    description: "$29/month, first month free.",
  },
];

// Root navigation bar: logo, mobile, and desktop nav
export const Navigation = () => (
  <div className="flex justify-center items-center gap-2">
    <MobileNav />
    <div className="flex-shrink-0">
      <Link to="/" className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-md bg-orange-500 flex items-center justify-center">
          <WrenchIcon />
        </div>
        <span className="text-lg font-semibold tracking-tight">Strata</span>
      </Link>
    </div>
    <DesktopNav />
  </div>
);

// Mobile hamburger menu, uses Sheet for slide-out drawer
const MobileNav = () => {
  return (
    <div className="md:hidden">
      <NavDrawer>
        {({ close }) => (
          <nav className="flex flex-col gap-4 px-6 pt-16 pb-8">
            {navigationItems.map((item) =>
              item.type === "section" ? (
                <div key={item.title}>
                  <p className="text-sm font-medium">{item.title}</p>
                  <div className="mt-2 flex flex-col gap-2 pl-4">
                    {item.items.map((subItem) => (
                      <Link
                        key={subItem.title}
                        to={subItem.href}
                        className="text-sm text-gray-600 hover:text-gray-900"
                        onClick={close}
                      >
                        {subItem.title}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : (
                <Link
                  key={item.title}
                  to={item.href}
                  className="text-sm font-medium hover:text-gray-900"
                  onClick={close}
                >
                  {item.title}
                </Link>
              )
            )}
          </nav>
        )}
      </NavDrawer>
    </div>
  );
};

// Desktop horizontal nav, supports dropdown sections
const DesktopNav = () => (
  <NavigationMenu className="hidden md:flex px-4">
    <NavigationMenuList className="flex gap-1">
      {navigationItems.map((item) => (
        <NavigationMenuItem key={item.title}>
          {item.type === "item" ? (
            <NavigationMenuLink asChild>
              <Link to={item.href} className={cn(navigationMenuTriggerStyle(), "inline-flex px-3")}>
                {item.title}
              </Link>
            </NavigationMenuLink>
          ) : (
            <>
              <NavigationMenuTrigger className="px-3 py-2 text-sm font-medium transition-colors hover:text-accent-foreground">
                {item.title}
              </NavigationMenuTrigger>
              <NavigationMenuContent className="min-w-[200px] p-2">
                <div className="p-2">
                  <div className="grid grid-cols-1">
                    {item.items.map((subItem) => (
                      <NavigationMenuLink key={subItem.title} asChild>
                        <Link
                          to={subItem.href}
                          className="block flex flex-col gap-1 rounded-md p-3 transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                        >
                          <div className="text-sm font-medium">{subItem.title}</div>
                          {subItem.description && (
                            <p className="text-sm text-muted-foreground">{subItem.description}</p>
                          )}
                        </Link>
                      </NavigationMenuLink>
                    ))}
                  </div>
                </div>
              </NavigationMenuContent>
            </>
          )}
        </NavigationMenuItem>
      ))}
    </NavigationMenuList>
  </NavigationMenu>
);

// Simple wrench mark for the logo
const WrenchIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 text-white" aria-hidden="true">
    <path
      fill="currentColor"
      d="M21 7.5a5.5 5.5 0 0 1-7.53 5.12l-4.7 4.7a2.5 2.5 0 1 1-3.54-3.54l4.7-4.7A5.5 5.5 0 1 1 21 7.5Zm-4.25-3a1.75 1.75 0 1 0 2.5 2.45 3.5 3.5 0 0 0-2.5-2.45Z"
    />
  </svg>
);

// --------------------------------------------------------------------------------------
// To extend: add to navigationItems. For custom rendering, edit MobileNav/DesktopNav.
// --------------------------------------------------------------------------------------