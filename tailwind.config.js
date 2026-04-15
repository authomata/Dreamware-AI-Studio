/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
        "./app/**/*.{js,ts,jsx,tsx}",
        "./components/**/*.{js,ts,jsx,tsx}",
        "./packages/studio/src/**/*.{js,jsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: {
                    DEFAULT: '#d9ff00',
                    hover: '#c8f000',
                },
                'app-bg': '#0e0e0e',
                'panel-bg': '#111111',
                'card-bg': '#161616',
                secondary: '#a1a1aa',
                muted: '#52525b',
            },
            fontFamily: {
                sans: ['var(--font-space-grotesk)', 'Space Grotesk', 'system-ui', '-apple-system', 'sans-serif'],
            },
            borderRadius: {
                'xl': '1rem',
                '2xl': '1.5rem',
                '3xl': '2rem',
            },
            boxShadow: {
                'glow': '0 0 20px rgba(217, 255, 0, 0.4)',
                'glow-soft': '0 0 24px rgba(217, 255, 0, 0.12)',
                'glow-accent': '0 0 20px rgba(168, 85, 247, 0.4)',
                '3xl': '0 35px 60px -15px rgba(0, 0, 0, 0.8)',
            }
        },
    },
    plugins: [],
}
