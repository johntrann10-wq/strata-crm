export type SeoPageKey =
  | "autoDetailingSoftware"
  | "mobileDetailingSoftware"
  | "windowTintSoftware"
  | "wrapPpfSoftware"
  | "mechanicSoftware"
  | "performanceSoftware"
  | "tireShopSoftware"
  | "mufflerExhaustSoftware"
  | "shopSchedulingSoftware"
  | "detailingCrm"
  | "orbisxAlternative"
  | "strataVsOrbisx"
  | "strataVsJobber"
  | "bestCrmAutoDetailing"
  | "bestWindowTintSoftware"
  | "bestPpfSoftware"
  | "bestAutomotiveShopScheduling";

export type SeoPageConfig = {
  key: SeoPageKey;
  path: string;
  navLabel: string;
  seoTitle: string;
  seoDescription: string;
  eyebrow: string;
  h1: string;
  intro: string;
  audience: string;
  pains: string[];
  benefits: { title: string; description: string }[];
  workflowSteps: { title: string; description: string }[];
  fitPoints: string[];
  ctaTitle: string;
  ctaBody: string;
  related: SeoPageKey[];
};

const pages: SeoPageConfig[] = [
  {
    key: "autoDetailingSoftware",
    path: "/auto-detailing-software",
    navLabel: "Auto Detailing Software",
    seoTitle: "Auto Detailing Software for scheduling, vehicles, quotes, and invoices",
    seoDescription: "Strata is auto detailing software for shops that need scheduling, vehicle history, quotes, invoices, and repeat-customer context in one system.",
    eyebrow: "Auto Detailing Software",
    h1: "Auto detailing software that keeps the day organized.",
    intro: "Strata helps detailing businesses run intake, vehicle history, scheduling, approvals, invoices, and follow-up without generic CRM clutter.",
    audience: "Built for solo detailers, growing studios, and mixed detailing shops.",
    pains: [
      "Customer notes, vehicles, appointments, and invoices get split across tools.",
      "Owners cannot quickly see today's schedule, waiting approvals, and pending money.",
      "Repeat customers are slower to handle when service history is fragmented.",
    ],
    benefits: [
      { title: "Vehicle-aware customer records", description: "Every client stays tied to the exact vehicle, prior jobs, notes, and invoices." },
      { title: "Cleaner booking flow", description: "Start at the month, drill into the day, and book the work with less friction." },
      { title: "Estimate-to-invoice continuity", description: "Move from quote to appointment to invoice without losing context." },
    ],
    workflowSteps: [
      { title: "Capture the client and vehicle", description: "Keep paint, interior, and prior-service notes attached to the right vehicle." },
      { title: "Book the detail clearly", description: "Select the day, assign the work, and keep service lines and deposits visible." },
      { title: "Finish, invoice, and follow up", description: "Send the invoice and preserve the visit in customer history for the next service." },
    ],
    fitPoints: ["Paint correction, coating, wash, and maintenance presets", "Vehicle-by-vehicle service memory", "A clearer system than generic schedulers"],
    ctaTitle: "Run your detailing business from one clearer system.",
    ctaBody: "Create your workspace, load detailing defaults, and see how fast you can go from intake to paid invoice.",
    related: ["mobileDetailingSoftware", "detailingCrm", "shopSchedulingSoftware"],
  },
  {
    key: "mobileDetailingSoftware",
    path: "/mobile-detailing-software",
    navLabel: "Mobile Detailing Software",
    seoTitle: "Mobile Detailing Software with scheduling, clients, vehicles, and invoices",
    seoDescription: "Strata is mobile detailing software for operators who need cleaner scheduling, vehicle records, invoices, and customer history without clunky shop software.",
    eyebrow: "Mobile Detailing Software",
    h1: "Mobile detailing software that keeps field work simple.",
    intro: "Strata gives mobile detailers a lighter way to manage bookings, customer info, vehicles, notes, invoices, and follow-up while staying organized on the move.",
    audience: "Built for solo mobile operators and small mobile crews that need speed on the phone without losing control.",
    pains: [
      "Important customer details get buried across texts, notes apps, and invoice tools.",
      "Travel, add-ons, and vehicles make booking harder than generic calendars expect.",
      "Operators need something simple on mobile but still reliable enough to run the business.",
    ],
    benefits: [
      { title: "Cleaner mobile workflow", description: "Daily actions are easier to complete on a phone without losing deeper operational power." },
      { title: "Customer and vehicle context in one place", description: "Arrival notes, service history, invoices, and recurring work stay attached to the right record." },
      { title: "Fast invoice handoff", description: "Finish the work, generate the invoice, and keep the job history ready for the next visit." },
    ],
    workflowSteps: [
      { title: "Add the customer once", description: "Keep the client, address, vehicle, and notes organized from the first visit." },
      { title: "Book the visit and lock in services", description: "Choose the service, attach the vehicle, and keep schedule context easy to read." },
      { title: "Invoice at the end of the job", description: "Generate the invoice fast and keep a clean service record for recurring customers." },
    ],
    fitPoints: ["A mobile-friendly CRM and invoicing flow", "Cleaner repeat-customer history", "Less friction than stitching together small tools"],
    ctaTitle: "Give your mobile detailing business a clearer daily system.",
    ctaBody: "Start free, preload mobile detailing defaults, and get operational without a long setup process.",
    related: ["autoDetailingSoftware", "shopSchedulingSoftware", "detailingCrm"],
  },
  {
    key: "windowTintSoftware",
    path: "/window-tint-shop-software",
    navLabel: "Window Tint Shop Software",
    seoTitle: "Window Tint Shop Software for tint scheduling, quotes, vehicles, and invoices",
    seoDescription: "Strata is window tint shop software built for tint businesses that need cleaner scheduling, vehicle context, quote approval, and invoice workflow.",
    eyebrow: "Window Tint Shop Software",
    h1: "Window tint shop software built for cleaner scheduling and billing.",
    intro: "Strata helps tint shops manage the flow from vehicle intake to appointment booking to final invoice, while keeping customer, vehicle, and quote context together.",
    audience: "Built for tint shops that need faster front-desk flow and stronger vehicle-by-vehicle memory.",
    pains: [
      "Appointments, film options, vehicle info, and quote follow-up get split across too many tools.",
      "Front-desk teams lose time confirming vehicle details and service scope on the day of the booking.",
      "Owners need a clearer picture of today's workload, open invoices, and pending approvals.",
    ],
    benefits: [
      { title: "Vehicle-linked tint history", description: "Customer and vehicle records stay connected for future work and prior-service context." },
      { title: "Cleaner quote and invoice flow", description: "Move from estimate to approved work to invoice with a more obvious workflow." },
      { title: "Simpler daily command center", description: "See today's appointments, active jobs, pending money, and approval bottlenecks in one place." },
    ],
    workflowSteps: [
      { title: "Take in the customer and vehicle", description: "Keep service notes, vehicle details, and the customer's history tied together." },
      { title: "Book the tint job clearly", description: "Use the calendar to see the month, open the day, and place the work without clutter." },
      { title: "Invoice and keep the record", description: "Send the invoice, print a clean document, and preserve the vehicle's service history." },
    ],
    fitPoints: ["Vehicle-specific customer records", "Cleaner estimate and invoice flow", "A more polished front-desk workflow"],
    ctaTitle: "Run tint scheduling, clients, and invoices from one system.",
    ctaBody: "Set up your tint shop workspace fast and keep the booking-to-billing flow easier to manage every day.",
    related: ["wrapPpfSoftware", "shopSchedulingSoftware", "orbisxAlternative"],
  },
  {
    key: "wrapPpfSoftware",
    path: "/wrap-ppf-shop-software",
    navLabel: "Wrap & PPF Shop Software",
    seoTitle: "Wrap and PPF Shop Software for quotes, scheduling, invoices, and vehicle history",
    seoDescription: "Strata is wrap and PPF shop software for businesses that need cleaner quoting, vehicle tracking, scheduling, and invoice workflows.",
    eyebrow: "Wrap & PPF Shop Software",
    h1: "Wrap and PPF shop software that keeps complex jobs easier to manage.",
    intro: "Strata gives wrap and paint-protection-film shops a clearer workflow for vehicle intake, estimate approval, scheduling, job execution, and billing.",
    audience: "Built for wrap and PPF businesses that need strong client and vehicle context without a bloated admin stack.",
    pains: [
      "Complex service scope and vehicle details are easy to lose between estimate, scheduling, and final invoice.",
      "Customer communication and approval tracking often live outside the main workflow.",
      "Owners need something that feels premium in front of customers without becoming heavy to run daily.",
    ],
    benefits: [
      { title: "Cleaner estimate approval path", description: "Keep quotes, approvals, appointments, and invoices connected so the customer handoff feels controlled." },
      { title: "Premium client-facing surfaces", description: "Invoice and approval flows look cleaner and more professional in public-facing moments." },
      { title: "Vehicle-centric record keeping", description: "Every vehicle's appointments, jobs, notes, quotes, and invoices stay linked." },
    ],
    workflowSteps: [
      { title: "Capture the vehicle and scope", description: "Store the customer, vehicle, and service context before work gets scheduled." },
      { title: "Get approval and book the job", description: "Move from quote to appointment with cleaner status visibility and fewer dead ends." },
      { title: "Track the job and close it properly", description: "Keep invoice, payment, and vehicle history tied to the finished work." },
    ],
    fitPoints: ["Better quote-to-job continuity", "Cleaner client presentation", "Vehicle service history that stays intact after the job"],
    ctaTitle: "Give wrap and PPF work a clearer operating flow.",
    ctaBody: "Start with wrap and PPF defaults and see how much easier quoting, scheduling, and invoicing can feel.",
    related: ["windowTintSoftware", "orbisxAlternative", "shopSchedulingSoftware"],
  },
  {
    key: "mechanicSoftware",
    path: "/mechanic-shop-software",
    navLabel: "Mechanic Shop Software",
    seoTitle: "Mechanic Shop Software for scheduling, jobs, estimates, invoices, and vehicle history",
    seoDescription: "Strata is mechanic shop software for small automotive businesses that need customer records, vehicle history, scheduling, jobs, estimates, and invoices in one place.",
    eyebrow: "Mechanic Shop Software",
    h1: "Mechanic shop software that feels clearer on the counter and in the bay.",
    intro: "Strata helps small mechanical shops keep appointments, jobs, clients, vehicles, estimates, invoices, and follow-up organized without the weight of older shop systems.",
    audience: "Built for independent mechanics, small service shops, and mixed automotive service businesses that still need real control.",
    pains: [
      "Service history, job status, and billing context are hard to follow when the workflow is split across systems.",
      "The dashboard often shows too much noise and not enough of what matters today.",
      "Shops need software that feels credible in front of customers and dependable enough for daily use.",
    ],
    benefits: [
      { title: "Vehicle service memory", description: "The vehicle record becomes the place where estimates, appointments, jobs, and invoices stay connected over time." },
      { title: "More operational dashboard", description: "Today's schedule, active jobs, pending money, and next actions are easier to read from one command center." },
      { title: "Cleaner estimate and invoice path", description: "Generate the estimate, run the appointment, and get the invoice out without losing context." },
    ],
    workflowSteps: [
      { title: "Create the client and vehicle", description: "Keep the customer and vehicle as the source of truth from the first visit onward." },
      { title: "Book and manage the work", description: "Use the calendar and job surfaces to keep the day's work visible and actionable." },
      { title: "Estimate, invoice, and follow up", description: "Stay on top of pending approvals, open invoices, and repeat visits from the same records." },
    ],
    fitPoints: ["A lighter but still capable shop system", "Better customer and vehicle history", "Cleaner daily visibility than generic admin software"],
    ctaTitle: "Run your mechanic shop with a clearer daily system.",
    ctaBody: "Start free, load mechanic defaults, and see how Strata handles clients, jobs, invoices, and follow-up.",
    related: ["performanceSoftware", "tireShopSoftware", "orbisxAlternative"],
  },
  {
    key: "performanceSoftware",
    path: "/performance-shop-software",
    navLabel: "Performance Shop Software",
    seoTitle: "Performance Shop Software for builds, scheduling, estimates, invoices, and customer history",
    seoDescription: "Strata is performance shop software built for shops that need cleaner scheduling, client and vehicle history, estimates, invoices, and job visibility.",
    eyebrow: "Performance Shop Software",
    h1: "Performance shop software that keeps build work and customer context organized.",
    intro: "Strata helps performance-focused automotive businesses handle scheduling, vehicle records, quotes, jobs, invoices, and follow-up with a cleaner workflow.",
    audience: "Built for shops handling installs, tuning, suspension, brakes, and performance-oriented service work.",
    pains: [
      "Complex vehicle work creates notes, customer history, and approval context that generic systems do not handle well.",
      "Owners need a tool that looks polished enough for serious customers but remains easy to run every day.",
      "Appointments, jobs, invoices, and follow-up need to stay connected around the same vehicle over time.",
    ],
    benefits: [
      { title: "Stronger vehicle memory", description: "Each vehicle can hold a cleaner history of appointments, jobs, estimates, and invoices across repeated visits." },
      { title: "Cleaner job visibility", description: "The app surfaces active jobs, pending money, and next actions without burying the operator in dashboard clutter." },
      { title: "Better estimate-to-payment continuity", description: "Keep the estimate, appointment, invoice, and customer communication aligned in one workflow." },
    ],
    workflowSteps: [
      { title: "Capture the customer and vehicle", description: "Store vehicle-specific context once and keep building on that record." },
      { title: "Quote, book, and run the work", description: "Move through approvals, appointments, and job execution with fewer blind spots." },
      { title: "Invoice and preserve the history", description: "Keep the financial trail and the service trail connected for future work." },
    ],
    fitPoints: ["Cleaner vehicle-centric customer records", "A more premium day-to-day workflow", "Better visibility across quoting, booking, and invoicing"],
    ctaTitle: "Keep performance work organized from intake to payment.",
    ctaBody: "Set up Strata with performance defaults and turn it into the system you check every day.",
    related: ["mechanicSoftware", "orbisxAlternative", "shopSchedulingSoftware"],
  },
  {
    key: "tireShopSoftware",
    path: "/tire-shop-software",
    navLabel: "Tire Shop Software",
    seoTitle: "Tire Shop Software for scheduling, vehicles, invoices, and customer follow-up",
    seoDescription: "Strata is tire shop software for shops that need cleaner scheduling, customer and vehicle records, invoices, and daily visibility.",
    eyebrow: "Tire Shop Software",
    h1: "Tire shop software that keeps daily work and customer records tighter.",
    intro: "Strata helps tire shops manage customers, vehicles, appointments, service flow, and invoices in a system that feels clearer than generic business software.",
    audience: "Built for tire-focused shops and mixed operations that need faster counter workflow and cleaner repeat-customer history.",
    pains: [
      "Customer, vehicle, and prior-service history are hard to recover quickly during fast-turn front-desk work.",
      "Scheduling and invoice visibility often sit in different tools, which creates daily friction.",
      "Owners need simple daily control, not bloated dashboards and confusing navigation.",
    ],
    benefits: [
      { title: "See today's work more clearly", description: "Use the dashboard and calendar to understand what's booked, what's in progress, and what still needs attention." },
      { title: "Keep vehicle history attached", description: "Repeat visits are easier because the customer's vehicle, invoices, and prior work stay connected." },
      { title: "Invoice with less friction", description: "Create the invoice, send it, print it cleanly, and preserve the service record without extra steps." },
    ],
    workflowSteps: [
      { title: "Create the customer and vehicle", description: "Make the CRM record the place where future visits and invoices stay anchored." },
      { title: "Book the appointment and run the day", description: "Use the calendar and daily surfaces to keep today's schedule readable." },
      { title: "Collect and retain the history", description: "Keep the invoice and vehicle memory ready for the next seasonal or repeat visit." },
    ],
    fitPoints: ["Less front-desk friction", "Better repeat-customer and vehicle memory", "A tighter schedule-to-invoice flow"],
    ctaTitle: "Run daily tire shop work with less admin clutter.",
    ctaBody: "Load tire shop defaults, keep the vehicle record useful, and make Strata your daily command center.",
    related: ["mechanicSoftware", "shopSchedulingSoftware", "orbisxAlternative"],
  },
  {
    key: "mufflerExhaustSoftware",
    path: "/muffler-exhaust-shop-software",
    navLabel: "Muffler & Exhaust Shop Software",
    seoTitle: "Muffler and Exhaust Shop Software for scheduling, estimates, invoices, and vehicle history",
    seoDescription: "Strata is muffler and exhaust shop software for small automotive businesses that need scheduling, estimate approval, invoices, and vehicle history in one system.",
    eyebrow: "Muffler & Exhaust Shop Software",
    h1: "Muffler and exhaust shop software that keeps the workflow easier to follow.",
    intro: "Strata gives exhaust and muffler shops a clearer way to manage customer records, vehicle history, estimates, appointments, invoices, and follow-up.",
    audience: "Built for small shops that need a polished system without the feel of old, bloated shop management software.",
    pains: [
      "Estimate, vehicle, and invoice context get split apart, which makes repeat visits and status checks slower.",
      "The operator needs one daily system that is simple enough to use under pressure but still credible with customers.",
      "Most tools either feel too generic or too heavy for a smaller independent shop.",
    ],
    benefits: [
      { title: "Cleaner estimate-to-invoice path", description: "Keep service scope, vehicle context, and invoice flow in one connected record set." },
      { title: "More useful customer and vehicle history", description: "Open the client or vehicle and recover the real service story quickly instead of hunting." },
      { title: "A more readable daily surface", description: "Use the dashboard and calendar to see what needs attention today without clutter." },
    ],
    workflowSteps: [
      { title: "Take in the client and vehicle", description: "Keep the core record clean so repeat work and follow-up are easier." },
      { title: "Estimate and book the work", description: "Move from quote to appointment with a cleaner status path and less confusion." },
      { title: "Invoice and keep the record alive", description: "Store the job outcome, payment, and customer history for the next visit." },
    ],
    fitPoints: ["A lighter daily system", "Better vehicle and invoice continuity", "More trust and polish in front of customers"],
    ctaTitle: "Keep exhaust-shop work moving from estimate to invoice.",
    ctaBody: "Set up Strata with exhaust-shop defaults and make your workflow easier to run every day.",
    related: ["mechanicSoftware", "performanceSoftware", "orbisxAlternative"],
  },
  {
    key: "shopSchedulingSoftware",
    path: "/shop-scheduling-software",
    navLabel: "Shop Scheduling Software",
    seoTitle: "Shop Scheduling Software for automotive service businesses",
    seoDescription: "Strata is shop scheduling software for automotive businesses that need a cleaner month-to-day calendar, client and vehicle context, and a tighter booking flow.",
    eyebrow: "Shop Scheduling Software",
    h1: "Shop scheduling software that starts clear at the month view.",
    intro: "Strata is built around a scheduling flow that feels easier to understand: start from the month, click into the day, and book work with the client and vehicle attached.",
    audience: "Built for service shops that need speed at the front desk and clarity during the day, not a bloated scheduler.",
    pains: [
      "Many schedulers feel cluttered, confusing, or disconnected from the customer record.",
      "Teams need to see today's work, what's unassigned, and what still needs attention without switching tools.",
      "A scheduler is not enough by itself if the client, vehicle, and invoice flow are disconnected.",
    ],
    benefits: [
      { title: "Month-first workflow", description: "See the month clearly, drill into the day that matters, and keep the booking path intuitive." },
      { title: "Client and vehicle context built in", description: "Appointments are tied to the client and vehicle so the team has more context when work starts." },
      { title: "Daily operations connected to the calendar", description: "Appointments flow into jobs, invoices, and follow-up instead of dying in a stand-alone schedule view." },
    ],
    workflowSteps: [
      { title: "See the month at a glance", description: "Use the broader view to understand load and choose the right day quickly." },
      { title: "Open the day's schedule", description: "Drill into appointments, details, and available time without extra clutter." },
      { title: "Carry the booking into the workflow", description: "Keep the same context when the appointment turns into a job, invoice, or follow-up." },
    ],
    fitPoints: ["A cleaner alternative to cluttered scheduling software", "Appointments tied to customer and vehicle records", "A scheduler that feeds the rest of the business workflow"],
    ctaTitle: "Use a calendar that supports the business, not just the appointment.",
    ctaBody: "Start free and see how Strata handles month view, day drill-down, booking, and follow-through.",
    related: ["detailingCrm", "autoDetailingSoftware", "orbisxAlternative"],
  },
  {
    key: "detailingCrm",
    path: "/detailing-crm",
    navLabel: "Detailing CRM",
    seoTitle: "Detailing CRM with vehicle history, appointments, invoices, and customer follow-up",
    seoDescription: "Strata is a detailing CRM for automotive service businesses that need customers, vehicles, appointments, invoices, and history tied together in one system.",
    eyebrow: "Detailing CRM",
    h1: "A detailing CRM that actually remembers the customer and the car.",
    intro: "Strata is a CRM built for automotive service shops, which means the vehicle matters as much as the customer. Every quote, appointment, invoice, and note stays tied together.",
    audience: "Built for detailers and service businesses that need stronger customer memory than a generic contact database can provide.",
    pains: [
      "Generic CRMs do not treat the vehicle as a first-class record, which breaks the service history.",
      "Customer timelines get fragmented when appointments, jobs, and invoices are spread across tools.",
      "Shops need a system of record, not just a lead list or inbox replacement.",
    ],
    benefits: [
      { title: "Client and vehicle stay connected", description: "You can open a customer and recover their next appointment, last visit, quotes, invoices, and vehicle history quickly." },
      { title: "History becomes useful", description: "The client and vehicle pages are evolving into real memory surfaces, not just static profile pages." },
      { title: "The CRM powers operations", description: "Scheduling, invoices, jobs, and follow-up all grow out of the same customer record." },
    ],
    workflowSteps: [
      { title: "Add the customer once", description: "Store the client and keep every vehicle and visit attached from the first session." },
      { title: "Use the CRM during daily operations", description: "Book work, send invoices, and reopen history from the same records." },
      { title: "Make repeat business easier", description: "Use history, notes, and prior invoices to move faster with returning customers." },
    ],
    fitPoints: ["A CRM that understands vehicles", "A better memory system for repeat customers", "A customer record that powers scheduling and billing"],
    ctaTitle: "Turn customer history into daily operational leverage.",
    ctaBody: "Start free and see how Strata handles clients, vehicles, appointments, and invoices from one connected CRM.",
    related: ["autoDetailingSoftware", "mobileDetailingSoftware", "shopSchedulingSoftware"],
  },
  {
    key: "orbisxAlternative",
    path: "/orbisx-alternative",
    navLabel: "OrbisX Alternative",
    seoTitle: "OrbisX Alternative for smaller automotive shops that want a clearer workflow",
    seoDescription: "Looking for an OrbisX alternative? Strata offers a clearer, lighter automotive shop workflow for scheduling, CRM, jobs, quotes, invoices, and follow-up.",
    eyebrow: "OrbisX Alternative",
    h1: "A clearer OrbisX alternative for smaller automotive shops.",
    intro: "Strata is for shop owners who want strong operational depth without a system that feels bloated, generic, or harder than it should be to run daily.",
    audience: "Built for small and growing automotive businesses that want modern shop software with less clutter and faster time to value.",
    pains: [
      "People want shop software that feels simpler to understand and easier to operate every day.",
      "They still need clients, vehicles, scheduling, quotes, invoices, and job visibility in one system.",
      "They want a product that feels modern, premium, and easier to trust in front of staff and customers.",
    ],
    benefits: [
      { title: "Cleaner workflow design", description: "Strata is shaped around clarity first, especially for scheduling, customer records, invoices, and the daily dashboard." },
      { title: "Faster first-session value", description: "Onboarding, defaults, and activation are tuned so a new shop reaches useful work faster." },
      { title: "A lighter operating feel", description: "The goal is a premium command center for the shop, not a crowded admin tool." },
    ],
    workflowSteps: [
      { title: "Get operational quickly", description: "Choose the shop type, preload defaults, and start with a more guided first session." },
      { title: "Run the core workflow daily", description: "Manage clients, vehicles, appointments, jobs, and invoices from one command center." },
      { title: "Build history that is hard to leave", description: "As customer and vehicle records deepen, Strata becomes the system of record for the business." },
    ],
    fitPoints: ["A simpler day-to-day operating experience", "A more modern, premium-feeling workflow", "Shop software that smaller teams can adopt faster"],
    ctaTitle: "See whether Strata is the better fit for your shop.",
    ctaBody: "Start free, choose your business type, and compare how the day-to-day workflow feels in practice.",
    related: ["mechanicSoftware", "windowTintSoftware", "shopSchedulingSoftware"],
  },
  {
    key: "strataVsOrbisx",
    path: "/strata-vs-orbisx",
    navLabel: "Strata vs OrbisX",
    seoTitle: "Strata vs OrbisX for smaller automotive service businesses",
    seoDescription:
      "Compare Strata vs OrbisX for smaller automotive service businesses. See how Strata positions on clarity, onboarding, daily workflow, and operational fit.",
    eyebrow: "Strata vs OrbisX",
    h1: "Strata vs OrbisX for shops that want a clearer daily workflow.",
    intro:
      "This page is for buyers actively comparing shop software. Strata is positioning toward smaller and growing automotive service businesses that want strong operational depth without a system that feels heavy, cluttered, or harder than it should be to run every day.",
    audience:
      "Best for owners comparing modern shop software for detailing, tint, wrap, mechanic, tire, or mixed automotive operations.",
    pains: [
      "A lot of buyers want serious shop functionality but do not want to feel buried under the software.",
      "The deciding factor is often not feature count alone. It is how clear the workflow feels in daily use.",
      "Smaller teams usually care about onboarding speed, front-desk clarity, and customer-facing polish as much as depth.",
    ],
    benefits: [
      {
        title: "Strata is built around clarity first",
        description: "The product is being shaped to make scheduling, client and vehicle records, jobs, invoices, and follow-up easier to understand at a glance.",
      },
      {
        title: "Faster time to value for smaller shops",
        description: "Onboarding, operational defaults, activation, and dashboard guidance are tuned so a new shop reaches useful work quickly.",
      },
      {
        title: "A more premium day-to-day feel",
        description: "Strata is aiming to feel modern, presentable, and lighter on mobile while still preserving real operational capability.",
      },
    ],
    workflowSteps: [
      { title: "Get operational faster", description: "Choose the shop type, apply sensible defaults, and move into a guided first session instead of a blank setup burden." },
      { title: "Run the core workflow daily", description: "Manage clients, vehicles, appointments, quotes, invoices, and jobs from one command center." },
      { title: "Build records that become hard to leave", description: "As customer and vehicle history deepens, Strata becomes the system of record for the shop." },
    ],
    fitPoints: [
      "Smaller teams that want less software friction",
      "Owners who care about mobile clarity and public-facing polish",
      "Shops comparing alternatives and valuing workflow quality over admin complexity",
    ],
    ctaTitle: "See whether Strata is the better everyday fit for your shop.",
    ctaBody: "Start free, load your shop type, and compare the day-to-day workflow in a real workspace instead of only reading feature lists.",
    related: ["orbisxAlternative", "mechanicSoftware", "shopSchedulingSoftware"],
  },
  {
    key: "strataVsJobber",
    path: "/strata-vs-jobber",
    navLabel: "Strata vs Jobber",
    seoTitle: "Strata vs Jobber for automotive shops and mobile detailers",
    seoDescription:
      "Compare Strata vs Jobber for automotive shops and mobile detailers. See where Strata fits businesses that need vehicle-aware records, scheduling, quoting, invoicing, and automotive-specific workflow clarity.",
    eyebrow: "Strata vs Jobber",
    h1: "Strata vs Jobber for automotive operators who need more than generic field service software.",
    intro:
      "Jobber can be a familiar starting point for general home-service businesses, but automotive operators usually need scheduling, vehicle context, quoting, invoicing, and repeat-customer history to stay closer together. Strata is built for that automotive-specific workflow, whether the work happens in a shop or on mobile jobs.",
    audience:
      "Best for detailers, tint shops, wrap and PPF businesses, mixed automotive operators, and mobile crews comparing a generic field-service tool against a purpose-built automotive workflow.",
    pains: [
      "Generic field-service software can feel clean at first, but it often loses the vehicle-specific context automotive businesses depend on.",
      "Mobile detailers and shop teams still need one system that handles scheduling, customer records, quotes, invoices, and repeat-service history together.",
      "Operators want software that feels credible in front of customers without forcing them to duct-tape automotive workflow on top of a generic service template.",
    ],
    benefits: [
      {
        title: "Automotive-specific records instead of generic customer jobs",
        description: "Strata keeps the client and the vehicle connected so every appointment, quote, invoice, and payment has the right service history attached.",
      },
      {
        title: "A better fit for shops and mobile operators",
        description: "The workflow is designed to stay clear whether you are booking work from the front desk, dispatching a small crew, or invoicing from the field.",
      },
      {
        title: "Built with operator input",
        description: "Strata is shaped with input from real shop owners and automotive operators who care about speed, clarity, and customer-facing polish.",
      },
    ],
    workflowSteps: [
      { title: "Capture the client and vehicle once", description: "Keep service history, vehicle details, and the customer's financial trail tied together from the first visit." },
      { title: "Book and run the work clearly", description: "Use the calendar and workflow surfaces to manage scheduled work without losing context between the phone, the desk, and the field." },
      { title: "Invoice, collect, and keep the history", description: "Preserve the job, the payment trail, and the vehicle memory so repeat business gets easier every month." },
    ],
    fitPoints: [
      "Automotive businesses that have outgrown generic field-service software",
      "Mobile detailers who still need vehicle-aware records and cleaner billing",
      "Owners and operators who want software shaped around real automotive workflow",
    ],
    ctaTitle: "See whether Strata fits your automotive workflow better than Jobber.",
    ctaBody: "Start free, choose your business type, and compare the day-to-day experience in a real Strata workspace.",
    related: ["mobileDetailingSoftware", "autoDetailingSoftware", "shopSchedulingSoftware"],
  },
  {
    key: "bestCrmAutoDetailing",
    path: "/best-crm-for-auto-detailing-shops",
    navLabel: "Best CRM for Auto Detailing Shops",
    seoTitle: "Best CRM for Auto Detailing Shops that need clients, vehicles, appointments, and invoices",
    seoDescription:
      "Looking for the best CRM for auto detailing shops? Strata is built for detailing businesses that need customer records, vehicle history, scheduling, quotes, invoices, and repeat-service memory.",
    eyebrow: "Best CRM for Auto Detailing Shops",
    h1: "What the best CRM for an auto detailing shop actually needs to do.",
    intro:
      "For a detailing shop, the best CRM is not just a contact database. It has to remember the client, the vehicle, the service history, the appointment trail, and the invoice trail in one place.",
    audience:
      "Built for detailers evaluating software specifically around customer retention, repeat visits, and vehicle-aware service history.",
    pains: [
      "Generic CRMs track people but not the vehicle-specific service history that detailing shops actually need.",
      "Repeat customers are harder to serve quickly when prior jobs, notes, and invoices are spread across tools.",
      "A detailing CRM only matters if it supports the booking and billing workflow, not just contact storage.",
    ],
    benefits: [
      {
        title: "Vehicle-first customer memory",
        description: "Strata ties the client and the vehicle together so each repeat visit starts with more context and less guesswork.",
      },
      {
        title: "CRM connected to operations",
        description: "Appointments, quotes, invoices, and follow-up grow out of the same records instead of living in separate systems.",
      },
      {
        title: "A more useful retention base",
        description: "As customer and vehicle history deepens, the CRM becomes more valuable every month and harder to replace.",
      },
    ],
    workflowSteps: [
      { title: "Store the client and vehicle together", description: "Build a cleaner source of truth for every repeat customer and their cars." },
      { title: "Use the CRM during booking and billing", description: "Keep estimates, appointments, invoices, and notes tied to the same records." },
      { title: "Make repeat business easier", description: "Open the client record and quickly understand what was last done and what might come next." },
    ],
    fitPoints: [
      "Detailing shops that rely on repeat customers",
      "Businesses that need stronger customer and vehicle memory",
      "Owners comparing CRMs with actual operational usefulness",
    ],
    ctaTitle: "Turn customer history into a real advantage for your detailing shop.",
    ctaBody: "Start free and see how Strata handles clients, vehicles, appointments, invoices, and follow-up in one CRM.",
    related: ["detailingCrm", "autoDetailingSoftware", "mobileDetailingSoftware"],
  },
  {
    key: "bestWindowTintSoftware",
    path: "/best-window-tint-shop-software",
    navLabel: "Best Window Tint Shop Software",
    seoTitle: "Best Window Tint Shop Software for scheduling, vehicle records, quotes, and invoices",
    seoDescription:
      "Looking for the best window tint shop software? Strata is built for tint businesses that need cleaner scheduling, vehicle records, estimate approval, and invoice flow.",
    eyebrow: "Best Window Tint Shop Software",
    h1: "What the best window tint shop software should actually make easier.",
    intro:
      "The best window tint shop software should reduce front-desk friction, keep the vehicle context attached, and make the quote-to-invoice path feel cleaner for both staff and customers.",
    audience:
      "Built for tint businesses comparing software for scheduling clarity, vehicle history, estimate flow, and public-facing polish.",
    pains: [
      "Most software either feels generic or forces tint-specific workflow details into a clunky shop system.",
      "Quote approval, appointment booking, vehicle details, and invoicing need to stay aligned around the same customer and car.",
      "Buyers care about how the software feels in front of staff and customers, not just whether it has modules.",
    ],
    benefits: [
      {
        title: "Cleaner front-desk scheduling",
        description: "Use a month-first calendar and drill into the day without fighting a bloated scheduler.",
      },
      {
        title: "Vehicle-linked service flow",
        description: "Keep tint work, vehicle details, invoices, and prior history attached to the same record.",
      },
      {
        title: "More polished estimate and invoice path",
        description: "Create the quote, book the work, and send the invoice with a more controlled client-facing workflow.",
      },
    ],
    workflowSteps: [
      { title: "Take in the customer and car", description: "Keep the intake record useful from the first appointment onward." },
      { title: "Book and run the tint work", description: "Keep the schedule, quote, and job context connected through the day." },
      { title: "Invoice and preserve the service history", description: "Make the finished work easy to reference for repeat business and future questions." },
    ],
    fitPoints: [
      "Tint shops that care about front-desk clarity",
      "Businesses that need vehicle-aware records",
      "Buyers comparing the best software, not just the cheapest",
    ],
    ctaTitle: "See whether Strata is the better-fit software for your tint shop.",
    ctaBody: "Start free, load tint defaults, and compare the actual workflow instead of only reading feature lists.",
    related: ["windowTintSoftware", "wrapPpfSoftware", "shopSchedulingSoftware"],
  },
  {
    key: "bestPpfSoftware",
    path: "/best-ppf-shop-software",
    navLabel: "Best PPF Shop Software",
    seoTitle: "Best PPF Shop Software for quotes, approvals, scheduling, and invoices",
    seoDescription:
      "Looking for the best PPF shop software? Strata is built for wrap and PPF businesses that need cleaner quoting, scheduling, vehicle records, and invoicing.",
    eyebrow: "Best PPF Shop Software",
    h1: "What the best PPF shop software should do beyond basic scheduling.",
    intro:
      "For a PPF business, the software has to handle more than appointments. It needs to keep quote scope, vehicle context, customer communication, invoice flow, and service history aligned around the same job.",
    audience:
      "Built for PPF and wrap businesses comparing software on quote control, schedule clarity, and customer-facing professionalism.",
    pains: [
      "Complex PPF work creates a lot of scope, approval, and vehicle context that is easy to lose in generic tools.",
      "The software has to feel premium enough for customer-facing moments, not just functional for the back office.",
      "Scheduling is only useful if it stays connected to the estimate, job, and final invoice.",
    ],
    benefits: [
      {
        title: "Better quote-to-job continuity",
        description: "Strata keeps quotes, appointments, invoices, and vehicle history tied together so the job flow feels more controlled.",
      },
      {
        title: "Stronger client-facing polish",
        description: "Estimate and invoice surfaces are being shaped to feel more premium and more trustworthy in public-facing use.",
      },
      {
        title: "Vehicle-centric record keeping",
        description: "Every visit builds the car's history instead of scattering context across unrelated systems.",
      },
    ],
    workflowSteps: [
      { title: "Capture the scope and the vehicle", description: "Keep service details attached to the car and the customer from the start." },
      { title: "Move through approval and scheduling", description: "Use a clearer quote and booking path that reduces workflow drift." },
      { title: "Finish, invoice, and preserve the job record", description: "Keep the completed work available for future visits and customer questions." },
    ],
    fitPoints: [
      "PPF businesses that care about quote control",
      "Shops that want more premium customer-facing software",
      "Operators looking for a cleaner workflow than generic shop tools",
    ],
    ctaTitle: "Use software that treats PPF work like a real high-consideration workflow.",
    ctaBody: "Start free, load wrap and PPF defaults, and see how Strata handles quoting, scheduling, and billing.",
    related: ["wrapPpfSoftware", "windowTintSoftware", "orbisxAlternative"],
  },
  {
    key: "bestAutomotiveShopScheduling",
    path: "/best-shop-scheduling-software-for-automotive-businesses",
    navLabel: "Best Shop Scheduling Software",
    seoTitle: "Best Shop Scheduling Software for Automotive Businesses",
    seoDescription:
      "Looking for the best shop scheduling software for an automotive business? Strata offers a cleaner month-to-day calendar, client and vehicle context, and a tighter booking workflow.",
    eyebrow: "Best Shop Scheduling Software",
    h1: "What the best shop scheduling software for automotive businesses should actually do.",
    intro:
      "The best shop scheduling software should not just show time slots. It should make it easier to understand the month, drill into the day, attach the right client and vehicle, and carry the booking into the rest of the business workflow.",
    audience:
      "Built for buyers comparing appointment software, calendars, and booking tools specifically for automotive service businesses.",
    pains: [
      "A lot of scheduling tools look clean in isolation but break down once vehicles, jobs, invoices, and staff context are involved.",
      "Owners need the calendar to support the rest of the workflow, not sit off to the side as a separate module.",
      "Mobile matters too, because scheduling often gets touched from the phone as much as the desk.",
    ],
    benefits: [
      {
        title: "Month-first clarity",
        description: "Strata is built around a calmer month view that lets the user open the day that matters instead of overprocessing views.",
      },
      {
        title: "Bookings tied to real records",
        description: "Appointments stay connected to the client and vehicle so the team has context when the work starts.",
      },
      {
        title: "Scheduling that leads into the job and invoice flow",
        description: "The appointment is part of a larger operating system, not just a slot on a calendar.",
      },
    ],
    workflowSteps: [
      { title: "See the month clearly", description: "Understand load and choose the right day faster." },
      { title: "Open the day and book the work", description: "Attach the right customer, vehicle, and service without extra noise." },
      { title: "Carry the booking forward", description: "Keep the same context when the appointment turns into a job, invoice, or follow-up." },
    ],
    fitPoints: [
      "Automotive businesses comparing scheduling platforms",
      "Owners who want a cleaner daily calendar flow",
      "Teams that need scheduling connected to CRM and billing",
    ],
    ctaTitle: "Use scheduling software that actually supports the rest of the shop.",
    ctaBody: "Start free and compare how Strata handles the month view, day drill-down, and booking workflow in practice.",
    related: ["shopSchedulingSoftware", "strataVsOrbisx", "windowTintSoftware"],
  },
];

export const seoPages = Object.fromEntries(pages.map((page) => [page.key, page])) as Record<SeoPageKey, SeoPageConfig>;
export const seoPageList = pages;

export const categorySeoPageKeys: SeoPageKey[] = [
  "autoDetailingSoftware",
  "mobileDetailingSoftware",
  "windowTintSoftware",
  "wrapPpfSoftware",
  "mechanicSoftware",
  "performanceSoftware",
  "tireShopSoftware",
  "mufflerExhaustSoftware",
];

export const featureSeoPageKeys: SeoPageKey[] = ["shopSchedulingSoftware", "detailingCrm"];

export const comparisonSeoPageKeys: SeoPageKey[] = [
  "orbisxAlternative",
  "strataVsOrbisx",
  "strataVsJobber",
  "bestCrmAutoDetailing",
  "bestWindowTintSoftware",
  "bestPpfSoftware",
  "bestAutomotiveShopScheduling",
];

export const categorySeoPages = categorySeoPageKeys.map((key) => seoPages[key]);
export const featureSeoPages = featureSeoPageKeys.map((key) => seoPages[key]);
export const comparisonSeoPages = comparisonSeoPageKeys.map((key) => seoPages[key]);
