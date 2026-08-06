// Registers a DOM into the Bun test process so React components can be rendered and asserted
// against real elements. Loaded via bunfig.toml `preload`.
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();
