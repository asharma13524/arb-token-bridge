import { useCallback, useEffect } from 'react'
import { L1TransactionReceipt, L1ToL2MessageStatus } from '@arbitrum/sdk'
import { AssetType } from 'token-bridge-sdk'

import { useActions, useAppState } from '../../state'
import { useInterval } from '../common/Hooks'
import { useNetworksAndSigners } from '../../hooks/useNetworksAndSigners'

export function RetryableTxnsIncluder(): JSX.Element {
  const actions = useActions()
  const {
    l1: { signer: l1Signer },
    l2: { signer: l2Signer }
  } = useNetworksAndSigners()

  const {
    app: { arbTokenBridge, arbTokenBridgeLoaded }
  } = useAppState()

  const checkAndUpdateFailedRetryables = useCallback(async () => {
    const failedRetryablesToRedeem = actions.app.getFailedRetryablesToRedeem()

    for (let depositTx of failedRetryablesToRedeem) {
      const depositTxReceipt = await l1Signer.provider.getTransactionReceipt(
        depositTx.txId
      )

      // TODO: Handle tx not found
      if (!depositTxReceipt) {
        return
      }

      const l1TxReceipt = new L1TransactionReceipt(depositTxReceipt)
      const l1ToL2Msg = await l1TxReceipt.getL1ToL2Message(l2Signer.provider)
      const status = await l1ToL2Msg.status()

      if (status !== L1ToL2MessageStatus.FUNDS_DEPOSITED_ON_L2) {
        arbTokenBridge?.transactions?.fetchAndUpdateL1ToL2MsgStatus(
          depositTx.txId,
          l1ToL2Msg,
          depositTx.asset === 'eth',
          status
        )
      }
    }
  }, [arbTokenBridge?.transactions?.addTransactions, l1Signer, l2Signer])

  /**
   * For every L1 deposit, we ensure the relevant L1ToL2MessageIsIncluded
   */
  const checkAndAddMissingL1ToL2Messagges = useCallback(async () => {
    const l1DepositsWithUntrackedL2Messages =
      actions.app.l1DepositsWithUntrackedL2Messages()

    for (let depositTx of l1DepositsWithUntrackedL2Messages) {
      const depositTxReceipt = await l1Signer.provider.getTransactionReceipt(
        depositTx.txID
      )

      // TODO: Handle tx not found
      if (!depositTxReceipt) {
        return
      }

      const l1TxReceipt = new L1TransactionReceipt(depositTxReceipt)

      if (depositTx.assetType === AssetType.ETH) {
        const [ethDepositMessage] = await l1TxReceipt.getEthDepositMessages(
          l2Signer.provider
        )

        arbTokenBridge?.transactions?.fetchAndUpdateEthDepositMessageStatus(
          depositTx.txID,
          ethDepositMessage
        )
      } else {
        const l1ToL2Msg = await l1TxReceipt.getL1ToL2Message(l2Signer)
        const status = await l1ToL2Msg.status()

        arbTokenBridge?.transactions?.fetchAndUpdateL1ToL2MsgStatus(
          depositTx.txID,
          l1ToL2Msg,
          false,
          status
        )
      }
    }
  }, [arbTokenBridge?.transactions?.addTransactions, l1Signer, l2Signer])

  const { forceTrigger: forceTriggerUpdate } = useInterval(
    checkAndAddMissingL1ToL2Messagges,
    5000
  )

  const { forceTrigger: forceTriggerUpdateFailedRetryables } = useInterval(
    checkAndUpdateFailedRetryables,
    10000
  )

  useEffect(() => {
    // force trigger update each time loaded change happens
    forceTriggerUpdate()
    forceTriggerUpdateFailedRetryables()
  }, [arbTokenBridgeLoaded])

  return <></>
}
