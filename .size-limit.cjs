module.exports = [
  {
    name: 'main entry (initial JS)',
    path: 'dist/assets/index-*.js',
    limit: '90 KB',
    gzip: true,
  },
  {
    name: 'config chunk (vendor)',
    path: 'dist/assets/config-*.js',
    limit: '145 KB',
    gzip: true,
  },
  {
    name: 'tires page chunk',
    path: 'dist/assets/TiresPage-*.js',
    limit: '42 KB',
    gzip: true,
  },
  {
    name: 'crm page chunk',
    path: 'dist/assets/CrmPage-*.js',
    limit: '17 KB',
    gzip: true,
  },
  {
    name: 'people page chunk',
    path: 'dist/assets/PeoplePage-*.js',
    limit: '22 KB',
    gzip: true,
  },
  {
    name: 'analytics page chunk',
    path: 'dist/assets/AnalyticsPage-*.js',
    limit: '10 KB',
    gzip: true,
  },
  {
    name: 'ops page chunk',
    path: 'dist/assets/OpsPage-*.js',
    limit: '9 KB',
    gzip: true,
  },
]
