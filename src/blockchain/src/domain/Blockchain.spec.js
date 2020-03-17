import '../util/rx.mjs'
import Block from './Block.js'
import Blockchain from './Blockchain.js'
import { PerfCount } from '../common/proxies.js'
import chai from 'chai'

const { assert } = chai

// Create blockchain with a genesis block
const ledger = PerfCount('validate')(new Blockchain())

console.log('Height: ', ledger.height())

describe('Blockchain Spec', () => {
  it('Should create a block chain and assert if valid', () => {
    const [g, ...blocks] = [...ledger]
    assert.isOk(blocks.length === 0)
    assert.equal(g.previousHash, '0'.repeat(64))
    assert.isOk(ledger.validate())
  })

  it('Should fail validation of two consecutive blocks', async () => {
    const chain = new Blockchain()
    let top = chain.push(new Block(chain.height() + 1, chain.top.hash, []))
    assert.equal(top.index, 2)
    top = chain.push(new Block(chain.height() + 1, chain.top.hash, []))
    assert.equal(top.index, 3)
    chain.top.index = 0 // tamper with index
    const validation = chain.validate()
    console.log(validation.toString())
    assert.isOk(validation.isFailure)
  })

  it('Should stream its blocks through its async generator', done => {
    const chain = new Blockchain()
    let top = chain.push(new Block(chain.height() + 1, chain.top.hash, []))
    assert.equal(top.index, 2)
    top = chain.push(new Block(chain.height() + 1, chain.top.hash, []))
    assert.equal(top.index, 3)

    // At this point blockchain has [genesis, block1, block2]
    const chain$ = Observable.fromAsyncGenerator(chain)
      .filter(block => !block.previousHash.startsWith('0000'))
      .subscribe({
        next(block) { console.log('Receiving new block: ', block.previousHash) },
        complete() { done() }
      })

    setInterval(() => {
      top = chain.push(new Block(chain.height() + 1, chain.top.hash, []))
      assert.isNotNull(top.hash)
    }, 1000)

    setTimeout(() => {
      chain$.unsubscribe()
      done()
    }, 10_000)
  }).timeout(11_000)

  it('Promise.allSettled used to validate two blockchain objects', () => {

    const chain1 = new Blockchain()
    chain1.push(new Block(chain1.height() + 1, chain1.top.hash, []))
    chain1.push(new Block(chain1.height() + 1, chain1.top.hash, []))

    const chain2 = new Blockchain()
    chain2.push(new Block(chain2.height() + 1, chain2.top.hash, []))
    chain2.push(new Block(chain2.height() + 1, chain2.top.hash, []))
    chain2.top.hash = 'XXXXXXX'

    return Promise.allSettled([
      validateLedger(chain1),
      validateLedger(chain2),
    ])
      .then(results => {
        assert.equal(results.length, 2)
        assert.equal(results[0].status, 'fulfilled')
        assert.equal(results[1].status, 'rejected')
        assert.equal(results[0].value.height(), 3)
        assert.isUndefined(results[1].value)
        assert.equal(results[1].reason.message, 'Chain validation failed Failure (Hash length must equal 64)')
      })
  })
})

function validateLedger(ledger) {
  return new Promise((resolve, reject) => {
    const chainValidation = ledger.validate()
    if (chainValidation.isFailure) {
      reject(new Error(`Chain validation failed ${chainValidation.toString()}`))
    }
    resolve(ledger)
  })
}

