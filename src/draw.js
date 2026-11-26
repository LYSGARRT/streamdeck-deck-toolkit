/** Sets a live key image (SVG or PNG data URL). Kept as one place in case a background layer is added later. */
export function paint(action, img) {
	return action.setImage(img);
}
