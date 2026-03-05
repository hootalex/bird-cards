document.addEventListener('DOMContentLoaded', function () {
	const card = document.querySelector('.birdcard');
	const info = document.querySelector('.speciesinfo');
	if (!card || !info || typeof ColorThief === 'undefined') return;

	function extractUrl(backgroundImage) {
		const m = /url\(("|'|)(.*?)\1\)/.exec(backgroundImage);
		return m ? m[2] : null;
	}

	function srgbToLinear(c) {
		c = c / 255;
		return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
	}

	function luminance([r, g, b]) {
		const R = srgbToLinear(r);
		const G = srgbToLinear(g);
		const B = srgbToLinear(b);
		return 0.2126 * R + 0.7152 * G + 0.0722 * B;
	}

	function meetsWhiteTextContrast(rgb) {
		// For white text, require contrast ratio >= 4.5:1 => background luminance <= 0.1833
		const L = luminance(rgb);
		return L <= 0.1833;
	}

	function darken(rgb, factor) {
		return rgb.map((c) => Math.round(c * factor));
	}

	const colorThief = new ColorThief();

	function rgbToHex([r, g, b]) {
		return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
	}

	function calculateContrast(rgb) {
		const L_bg = luminance(rgb);
		const L_text = 1; // white text
		return (L_text + 0.05) / (L_bg + 0.05);
	}

	function rgbToHsl([r, g, b]) {
		r /= 255; g /= 255; b /= 255;
		const max = Math.max(r, g, b), min = Math.min(r, g, b);
		let h, s, l = (max + min) / 2;
		if (max === min) {
			h = s = 0;
		} else {
			const d = max - min;
			s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
			switch (max) {
				case r: h = (g - b) / d + (g < b ? 6 : 0); break;
				case g: h = (b - r) / d + 2; break;
				case b: h = (r - g) / d + 4; break;
			}
			h /= 6;
		}
		return [h, s, l];
	}

	function hslToRgb([h, s, l]) {
		let r, g, b;
		if (s === 0) {
			r = g = b = l;
		} else {
			const hue2rgb = (p, q, t) => {
				if (t < 0) t += 1;
				if (t > 1) t -= 1;
				if (t < 1/6) return p + (q - p) * 6 * t;
				if (t < 1/2) return q;
				if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
				return p;
			};
			const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
			const p = 2 * l - q;
			r = hue2rgb(p, q, h + 1/3);
			g = hue2rgb(p, q, h);
			b = hue2rgb(p, q, h - 1/3);
		}
		return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
	}

	function applyColorToInfoFromImage(img) {
		try {
			let color = colorThief.getColor(img);
			// Make the color a bit darker and less saturated
			color = darken(color, 0.95);
			let [h, s, l] = rgbToHsl(color);
			s = Math.max(0, s - 0.1);
			color = hslToRgb([h, s, l]);
			if (!meetsWhiteTextContrast(color)) {
				let factor = 0.92;
				let attempts = 0;
				while (!meetsWhiteTextContrast(color) && attempts < 12) {
					color = darken(color, factor);
					attempts++;
				}
			}
			// gradient: top fully transparent, bottom the detected color at 80%
			info.style.background = `linear-gradient(to bottom, rgba(${color[0]}, ${color[1]}, ${color[2]}, 0) 0%, rgba(${color[0]}, ${color[1]}, ${color[2]}, 1) 80%)`;
			// Set .colorinfo to the extracted color and display info
			const colorInfoEl = document.querySelector('.colorinfo');
			if (colorInfoEl) {
				colorInfoEl.style.backgroundColor = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
				const hex = rgbToHex(color);
				const contrast = calculateContrast(color);
				let level = '';
				if (contrast >= 7) level = 'AAA Pass';
				else if (contrast >= 4.5) level = 'AA Pass';
				else level = 'Fail';
				colorInfoEl.innerHTML = `<div>${hex}</div><div>${contrast.toFixed(2)}:1 (${level})</div>`;
			}
		} catch (e) {
			console.warn('Color extraction failed', e);
		}
	}

	function setCardBackground(url) {
		if (!url) return;
		card.style.backgroundImage = `url("${url}")`;
		const img = new Image();
		img.crossOrigin = 'Anonymous';
		img.src = url;
		img.addEventListener('load', function () {
			applyColorToInfoFromImage(img);
		});
		img.addEventListener('error', function () {
			console.warn('Failed to load image for color extraction', url);
		});
	}

	// initial background
	const bg = getComputedStyle(card).backgroundImage;
	const initialUrl = extractUrl(bg);
	if (initialUrl) setCardBackground(initialUrl);

	// click handler for gallery images
	document.querySelectorAll('.gallery img').forEach(function (imgEl) {
		imgEl.addEventListener('click', function () {
			// use the image's src (browser will resolve to an absolute URL)
			setCardBackground(imgEl.src);
		});
	});

	// dropzone functionality
	const dropzone = document.getElementById('imageDropzone');
	const fileInput = document.getElementById('imageFileInput');

	if (dropzone && fileInput) {
		// click to open file picker
		dropzone.addEventListener('click', function () {
			fileInput.click();
		});

		// file input change handler
		fileInput.addEventListener('change', function (e) {
			if (e.target.files && e.target.files[0]) {
				handleImageFile(e.target.files[0]);
			}
		});

		// drag over
		dropzone.addEventListener('dragover', function (e) {
			e.preventDefault();
			e.stopPropagation();
			dropzone.classList.add('dragover');
		});

		// drag leave
		dropzone.addEventListener('dragleave', function (e) {
			e.preventDefault();
			e.stopPropagation();
			dropzone.classList.remove('dragover');
		});

		// drop
		dropzone.addEventListener('drop', function (e) {
			e.preventDefault();
			e.stopPropagation();
			dropzone.classList.remove('dragover');

			if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
				const file = e.dataTransfer.files[0];
				if (file.type.startsWith('image/')) {
					handleImageFile(file);
				} else {
					alert('Please drop an image file.');
				}
			}
		});
	}

	function handleImageFile(file) {
		const reader = new FileReader();
		reader.onload = function (event) {
			setCardBackground(event.target.result);
		};
		reader.onerror = function () {
			alert('Failed to read the image file.');
		};
		reader.readAsDataURL(file);
	}
});

