function getBackgroundColor(percent, isDark) {
    if (isDark) {
        // Dark mode: less saturated, darker colors
        if (percent > 2) return 'hsl(0, 40%, 30%)'; // Dark red
        const hue = ((2 - percent) / 2) * 120;
        return `hsl(${hue}, 40%, 30%)`; // Dark green to dark yellow
    } else {
        // Light mode: vibrant colors
        if (percent > 2) return 'hsl(0, 70%, 50%)'; // Bright red
        const hue = ((2 - percent) / 2) * 120;
        return `hsl(${hue}, 70%, 50%)`; // Bright green to bright yellow
    }
}

function applyColors() {
    const isDark = document.documentElement.classList.contains('dark');
    document.querySelectorAll('.color-indicator').forEach(el => {
        const percentage = parseFloat(el.dataset.percentage);
        el.style.backgroundColor = getBackgroundColor(percentage, isDark);
    });
}

document.addEventListener('DOMContentLoaded', applyColors);
window.addEventListener('themeChanged', applyColors);