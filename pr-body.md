## Changes
- **fix: font size scaling** — was using ont-size: N% which doesn't affect children with explicit px sizes; switched to zoom: N/100 which scales the entire subtree including fixed-px fonts
- **fix: font size controls position** — moved pill from sticky bottom to sticky top so it appears at the top-right of the content area on hover
## Version
patch bump (1.21.0 → 1.21.1)
