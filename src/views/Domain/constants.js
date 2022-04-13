import reduxService from 'services/redux'

const constants = reduxService.prepareConstants(
  'views/MyDomains',
  [
    'SET_DOMAIN',
    'SET_LOADING', 
    'SET_AUCTION_PHASES',

    // records
    'IS_SETTING_RECORD',
    'IS_LOADING_RECORDS',
    'RECORDS_LOADED',
    'SET_RECORD_COMPLETE',
    'SET_RESOLVER',
    'SET_RESOLVER_LOADING',
    'SET_RESOLVER_COMPLETE',
  ]
)

export default constants
