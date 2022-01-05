import constants from './constants'
import selectors from './selectors'
import services from 'services'

import client from '@avvy/client'
import { ethers } from 'ethers'

const actions = {
  setAuctionPhases: (auctionPhases) => {
    return {
      type: constants.SET_AUCTION_PHASES,
      auctionPhases
    }
  },

  loadAuctionPhases: () => { return async (dispatch, getState) => {
      const api = services.provider.buildAPI()
      const auctionPhases = await api.getAuctionPhases()
      dispatch(actions.setAuctionPhases(auctionPhases))
    }
  },

  setProofProgress: (proofProgress) => {
    return {
      type: constants.SET_PROOF_PROGRESS,
      proofProgress
    }
  },

  setPricingProof: (domain, proof) => {
    return {
      type: constants.SET_PRICING_PROOF,
      domain,
      proof,
    }
  },

  setConstraintsProof: (domain, proof) => {
    return {
      type: constants.SET_CONSTRAINTS_PROOF,
      domain,
      proof,
    }
  },

  setHasBidError: (hasError) => {
    return {
      type: constants.SET_HAS_BID_ERROR,
      hasError
    }
  },

  setBiddingIsComplete: (isComplete) => {
    return {
      type: constants.SET_BIDDING_IS_COMPLETE,
      isComplete
    }
  },

  setBiddingInProgress: (value) => {
    return {
      type: constants.SET_BIDDING_IN_PROGRESS,
      value
    }
  },

  generateProofs: (names) => {
    return async (dispatch, getState) => {
      try {
        const state = getState()
        const names = services.sunrise.selectors.unsubmittedBidNames(state)
        const api = services.provider.buildAPI()
        let j = 0;
        const numSteps = names.length * 2
        for (let i = 0; i < names.length; i += 1) {
          let name = names[i]
          dispatch(actions.setProofProgress({
            message: `Generating pricing proof for ${name} (${j+1}/${numSteps})`,
            percent: parseInt((j / numSteps) * 100)
          }))
          let pricingRes = await api.generateDomainPriceProof(name)
          dispatch(actions.setPricingProof(name, pricingRes.calldata))
          j += 1
          dispatch(actions.setProofProgress({
            message: `Generating constraints proof for ${name} (${j+1}/${numSteps})`,
            percent: parseInt((j / numSteps) * 100),
          }))
          let constraintsRes = await api.generateConstraintsProof(name)
          dispatch(actions.setConstraintsProof(name, constraintsRes.calldata))
          j += 1
        }
        dispatch(actions.setProofProgress({
          message: `Done`,
          percent: 100,
        }))
      } catch (err) {
        console.log(err)
        return dispatch(actions.setHasBidError(true))
      }
    }
  },

  submitBid: () => {
    return async (dispatch, getState) => {
      dispatch(actions.setBiddingInProgress(true))
      const api = services.provider.buildAPI()
      const state = getState()

      // this maps bids to "bundles" which get submitted to the chain
      const bids = services.sunrise.selectors.bids(state)
      const names = services.sunrise.selectors.unsubmittedBidNames(state)
      
      const bundle = {}
      for (let i = 0; i < names.length; i += 1) {
        let name = names[i]
        if (i === 0) {
          bundle.payload = {
            names: [],
            amounts: [],
            salt: services.random.salt()
          }
        }
        let hash = await client.nameHash(name)
        bundle.payload.names[i] = hash.toString()
        bundle.payload.amounts[i] = bids[name]
        bundle[name] = {
          amount: bids[name],
          hash: hash.toString()
        }
      }

      bundle.payload.hash = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          ['int[]', 'int[]', 'string'],
          [bundle.payload.names, bundle.payload.amounts, bundle.payload.salt]
        )
      )
      
      try {
        await api.bid(bundle.payload.hash)
      } catch (err) {
        console.log(err)
        return dispatch(actions.setHasBidError(true))
      }
      
      names.forEach((name) => {
        dispatch(services.sunrise.actions.setBidBundle(name, bundle.payload.hash))
      })

      dispatch(services.sunrise.actions.addBundle(bundle.payload.hash, bundle))
      dispatch(actions.setBiddingInProgress(false))
      dispatch(actions.setBiddingIsComplete(true))
    }
  },

  setRevealingBundle: (bundleKey, value) => {
    return {
      type: constants.SET_REVEALING_BUNDLE,
      bundleKey,
      value
    }
  },

  setHasRevealError: (value) => {
    return {
      type: constants.SET_HAS_REVEAL_ERROR,
      value
    }
  },

  revealBundle: (bundleKey) => {
    return async (dispatch, getState) => {
      dispatch(actions.setRevealingBundle(bundleKey, true))
      const api = services.provider.buildAPI()
      const state = getState()
      const bundles = services.sunrise.selectors.bundles(state)
      const bundle = bundles[bundleKey]
      try { 
        await api.reveal(bundle.payload.names, bundle.payload.amounts, bundle.payload.salt)
      } catch (err) {
        console.log(err)
        dispatch(actions.setRevealingBundle(bundleKey, false))
        return dispatch(actions.setHasRevealError(true))
      }
      dispatch(actions.setRevealingBundle(bundleKey, false))
      dispatch(services.sunrise.actions.revealBundle(bundleKey))
    }
  },

  setAuctionResult: (domain, result) => {
    return {
      type: constants.SET_AUCTION_RESULT,
      domain,
      result
    }
  },

  setLoadingWinningBids: (isLoading) => {
    return {
      type: constants.SET_LOADING_WINNING_BIDS,
      isLoading
    }
  },

  loadWinningBids: () => {
    return async (dispatch, getState) => {
      const state = getState()
      const isLoading = selectors.isLoadingWinningBids(state)
      if (isLoading) return
      dispatch(actions.setLoadingWinningBids(true))
      const api = services.provider.buildAPI()
      const bids = services.sunrise.selectors.bids(state)
      const bidBundles = services.sunrise.selectors.bidBundles(state)
      const revealedBundles = services.sunrise.selectors.revealedBundles(state)
      const names = []
      for (let domain in bidBundles) {
        if (revealedBundles[bidBundles[domain]]) {
          try {
            await api.getWinningBid(domain)
          } catch (err) {
            dispatch(actions.setAuctionResult(domain, 'NO_WINNER'))
            console.log(err)
          }
          names.push(domain)
        }
      }
      console.log(names)
      setTimeout(() => {
        dispatch(actions.setLoadingWinningBids(false))
      }, 60000)
    }
  },

  setAvailableWavax: (amount) => {
    return {
      type: constants.SET_AVAILABLE_WAVAX,
      amount
    }
  },

  setApprovedWavax: (amount) => {
    return {
      type: constants.SET_APPROVED_WAVAX,
      amount
    }
  },

  checkAvailableWAVAX: () => {
    return async (dispatch, getState) => {
      const api = services.provider.buildAPI()
      const wavax = await api.getAuctionWavax()
      const balance = await api.getWavaxBalance()
      dispatch(actions.setAvailableWavax(balance))
      dispatch(actions.setApprovedWavax(wavax))
    }
  },

  approveWavax: (total) => {
    return async (dispatch, getState) => {
      const api = services.provider.buildAPI()
      api.approveWavaxForAuction(total)
    }
  }
}

export default actions
