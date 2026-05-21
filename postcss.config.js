module.exports = {
    plugins: {
        'postcss-import': {},
        ...(process.env.NODE_ENV === 'production' || process.env.npm_lifecycle_event === 'build'
            ? { cssnano: { preset: 'default' } }
            : {}),
    },
};
