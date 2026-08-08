/**
 * The capability grant, with the price of each one — loops/08-users-and-x.md §3.5.
 *
 * This is the argument the page is built around. A dollar cap depends on measurement and the
 * measurement is broken (§3.6); a capability grant is a boolean and cannot be wrong. A member who
 * may not grant `video` cannot create an agent that spends $5.52, regardless of what the meter
 * says, whether the meter works, or whether a retry loop went wrong.
 *
 * So the prices are shown *next to the switch*, not on a pricing page. The switch is the control
 * that survives a broken meter, and a user who can see what the switch costs is making the
 * decision the product actually wants them to make.
 *
 * The figures are §3.5's, which are the verified xAI platform prices this pivot's research
 * recorded. They are not read from a ledger and are not presented as spend — they are the price
 * list attached to a permission. `06-tools-cost` owns the rate table that will price actual usage;
 * this loop does not keep a second cost meter.
 */
import type { CapabilityGrant } from "./types";

export type CapabilityKey = keyof CapabilityGrant;

export const CAPABILITY_KEYS: CapabilityKey[] = ["images", "video", "voice", "publishToX"];

export interface CapabilityMeta {
  key: CapabilityKey;
  /** The word on the pill. Plain language — a salesperson reads this, not an engineer. */
  label: string;
  /** What granting it lets that person's agents reach. */
  reach: string;
  /** What it costs when they use it, verbatim from §3.5. Empty for a capability that is not spend. */
  price: string;
  /** Why this one is worth a moment's thought before it is granted. */
  note: string;
}

export const CAPABILITIES: Record<CapabilityKey, CapabilityMeta> = {
  images: {
    key: "images",
    label: "images",
    reach: "/v1/images/*",
    price: "$0.02 an image · $0.05 at higher quality",
    note: "The cheapest of the three, and the one most agents ask for first.",
  },
  video: {
    key: "video",
    label: "video",
    reach: "/v1/videos/*",
    price: "$0.050 a second · $0.080 a second on 1.5",
    note:
      "Separable from images on purpose. This is the line that turns a minute of output into " +
      "several dollars, so it is the one grant worth withholding by default.",
  },
  voice: {
    key: "voice",
    label: "voice",
    reach: "/v1/tts, /v1/stt, /v1/realtime",
    price: "$15.00 per million characters · $0.05–0.08 a minute live",
    note: "Cheap per call and easy to leave running, which is a different shape of expensive.",
  },
  publishToX: {
    key: "publishToX",
    label: "publish to X",
    reach: "the connected X account",
    price: "",
    note:
      "Not a spend — the only irreversible action in the product. Deleting a post does not " +
      "unsend it, so this grant is owner and approver only by default.",
  },
};

/**
 * The anchor figure (§3.5).
 *
 * One number, stated once, that makes the grants above mean something to somebody who has never
 * seen a rate card. It is an arithmetic consequence of the price list, not a measurement, and the
 * page labels it as such.
 */
export const SIXTY_SECOND_EXPERIENCE_USD = 5.52;

/** The grants a person holds, in a fixed order so two rows can be compared by eye. */
export const grantedKeys = (grant: CapabilityGrant): CapabilityKey[] =>
  CAPABILITY_KEYS.filter((key) => grant[key]);

/**
 * Every capability in the first grant that is missing from the second.
 *
 * The rule this serves is server-side and not written yet: a user cannot grant an agent a
 * capability the user does not hold, and the refusal names the missing capability rather than
 * hiding the control (§3.5). The page uses it to say the same thing in advance.
 */
export const missingFrom = (wanted: CapabilityGrant, held: CapabilityGrant): CapabilityKey[] =>
  CAPABILITY_KEYS.filter((key) => wanted[key] && !held[key]);
