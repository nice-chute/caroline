import React, { useState, useEffect } from 'react';
import { Connection, PublicKey, Keypair, clusterApiUrl, LAMPORTS_PER_SOL, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, NATIVE_MINT } from "@solana/spl-token";
import {
  Program, Provider, web3
} from '@project-serum/anchor';
import idl from './idl.json';
import * as anchor from "@project-serum/anchor";

// Wallet adapter
import { getPhantomWallet } from '@solana/wallet-adapter-wallets';
import { useWallet, WalletProvider, ConnectionProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';

// Bootstrap components
import Container from 'react-bootstrap/Container';
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Card from 'react-bootstrap/Card';
import Button from 'react-bootstrap/Button';
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import ListGroup from 'react-bootstrap/ListGroup'
import Form from 'react-bootstrap/Form';
import Spinner from 'react-bootstrap/Spinner'
import Navbar from 'react-bootstrap/Navbar'
import Nav from 'react-bootstrap/Nav'

// CSS
import './App.css';
import { token } from '@project-serum/anchor/dist/cjs/utils';
import { InputGroup } from 'react-bootstrap';
require('@solana/wallet-adapter-react-ui/styles.css');

// Globals
const market = new PublicKey("EQkCga3Rtkt4AFhJToY6jsstGzRHkDp6asgLxu6srkJc");

const wallets = [getPhantomWallet()]
const network = clusterApiUrl('devnet');
const opts = {
  preflightCommitment: "processed"
}
const programID = new PublicKey(idl.metadata.address);
const { SystemProgram } = web3;

function App() {
  // User token accounts
  const [profile, setProfile] = useState({});
  // Listings on swap
  const [listings, setListings] = useState([]);

  // Wallet connected
  const wallet = useWallet()
  // Connection to Solana rpc
  async function getProvider() {
    const connection = new Connection(network, opts.preflightCommitment);
    const provider = new Provider(
      connection, wallet, opts.preflightCommitment,
    );
    return provider;
  }

  // Run on initial render
  useEffect(() => {
    (async () => {
      if (
        !wallet ||
        !wallet.publicKey
      ) {
        return;
      }
      // user profile
      const publicKey = wallet.publicKey;
      let profile = await getProfile(publicKey);
      setProfile(profile);
      let listings = await getListings();
      setListings(listings)
    })();
  }, [wallet]);

  // Get token accounts for wallet connected
  async function getProfile(pubkey) {
    const provider = await getProvider();
    let tokenAccounts = await provider.connection.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_PROGRAM_ID });
    let token_accs = []
    let nft_token_accs = []
    for (let i = 0; i < tokenAccounts.value.length; i++) {
      token_accs.push(tokenAccounts.value[i])
      let tokenAccountMint = new PublicKey(tokenAccounts.value[i].account.data.parsed.info.mint);
      let mintInfo = await provider.connection.getParsedAccountInfo(tokenAccountMint)
      let tokenBalance = parseInt(tokenAccounts.value[i].account.data.parsed.info.tokenAmount.amount);
      let mintSupply = parseInt(mintInfo.value.data.parsed.info.supply);
      if (mintSupply === 1 && tokenBalance == 1) {
        nft_token_accs.push(tokenAccounts.value[i]);
      }
    }
    return { "pubkey": pubkey, "tokenAccounts": token_accs, "nftTokenAccounts": nft_token_accs }
  }

  async function getListings() {
    const provider = await getProvider();
    const program = new Program(idl, programID, provider);

    let listings = []
    let user_listings = []
    let accounts = await provider.connection.getProgramAccounts(program.programId);
    for (let i = 0; i < accounts.length; i++) {
      // Try to fetch the listing account, throws error if its not a listing
      try {
        let listing = await program.account.listing.fetch(accounts[i].pubkey);
        listings.push(listing)
        if (listing.seller.equals(provider.wallet.publicKey)) {
          user_listings.push(listing)
        }
      }
      catch (err) {
      }
    }
    return { 'activeListings': listings, 'userListings': user_listings }
  }

  function NFTCard({ props }) {
    // Listing price
    const [listingPrice, setListingPrice] = useState("");
    console.log("props", props)

    async function handleClick() {
      try {
        let price = new anchor.BN(listingPrice * LAMPORTS_PER_SOL)
        // Program
        const provider = await getProvider();
        const program = new Program(idl, programID, provider);

        // Nft account info for the card
        let nftAccount = props.pubkey;
        let data = props.account.data.parsed.info;
        let nftMint = new PublicKey(data.mint);
        // Listing PDA
        let [listing, listingBump] = await PublicKey.findProgramAddress(
          [
            Buffer.from(anchor.utils.bytes.utf8.encode("listing")),
            market.toBuffer(),
            nftMint.toBuffer(),
            provider.wallet.publicKey.toBuffer(),
          ],
          program.programId
        );
        // NFT vault PDA
        let [nftVault, nftVaultBump] = await PublicKey.findProgramAddress(
          [
            Buffer.from(anchor.utils.bytes.utf8.encode("vault")),
            nftMint.toBuffer(),
          ],
          program.programId
        );
        // Logging
        console.log("program id:", program.programId.toBase58())
        console.log("nft vault:", nftVault.toBase58())
        console.log("mint:", nftMint.toBase58())
        console.log("pubkey:", nftAccount.toBase58())
        console.log("listing:", listing.toBase58())
        // Create listing
        const tx = await program.rpc.createListing(
          price,
          listingBump,
          nftVaultBump,
          {
            accounts: {
              signer: provider.wallet.publicKey,
              listing: listing,
              market: market,
              nftVault: nftVault,
              nftAccount: nftAccount,
              nftMint: nftMint,
              systemProgram: SystemProgram.programId,
              tokenProgram: TOKEN_PROGRAM_ID,
              rent: SYSVAR_RENT_PUBKEY
            },
            signers: []
          });
        console.log(tx)
      }
      catch (err) {
        console.log(err)
      }
    }

    if (Object.keys(props).length === 0 && props.constructor === Object) {
      return (
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
      )
    }
    else {
      return (
        <Card className="card">
          <Container>
            <Card.Img className="nft" src="https://cdn.solanamonkey.business/gen2/2986.png" />
          </Container>
          <Card.Body className="card-body justify-content-center">
            <div className="input-group mb-3">
              <input type="text" className="form-control" min="0" placeholder="SOL" value={listingPrice} onChange={event => {
                setListingPrice(event.target.value);
              }}
              ></input>
              <div className="input-group-append">
                <button className="btn btn-outline-secondary" type="button" onClick={(e) => handleClick()}>List</button>
              </div>
            </div>
          </Card.Body>
        </Card>
      );
    }
  }

  function ListingCard({ props }) {
    // Buy nft
    async function handleClick() {
      try {
        // Program
        const provider = await getProvider();
        const program = new Program(idl, programID, provider);
        console.log(props)
        // Mint + market
        let nftMint = new PublicKey(props.nftMint);
        let market = new PublicKey(props.market)
        let buyerNFTAcc = Keypair.generate();
        // Listing PDA
        let [listing, listingBump] = await PublicKey.findProgramAddress(
          [
            Buffer.from(anchor.utils.bytes.utf8.encode("listing")),
            market.toBuffer(),
            props.nftMint.toBuffer(),
            props.seller.toBuffer(),
          ],
          program.programId
        );
        // Market vault PDA
        let [marketVault, marketVaultBump] = await PublicKey.findProgramAddress(
          [
            Buffer.from(anchor.utils.bytes.utf8.encode("vault")),
            market.toBuffer(),
            NATIVE_MINT.toBuffer(),
          ],
          program.programId
        );
        // NFT vault PDA
        let [nftVault, nftVaultBump] = await PublicKey.findProgramAddress(
          [
            Buffer.from(anchor.utils.bytes.utf8.encode("vault")),
            nftMint.toBuffer(),
          ],
          program.programId
        );
        // Buy nft
        const tx = await program.rpc.buy(
          listingBump,
          marketVaultBump,
          nftVaultBump,
          {
            accounts: {
              signer: provider.wallet.publicKey,
              signerNftAcc: buyerNFTAcc.publicKey,
              listing: listing,
              seller: props.seller,
              market: market,
              marketVault: marketVault,
              nftVault: nftVault,
              nftMint: nftMint,
              nativeMint: NATIVE_MINT,
              systemProgram: SystemProgram.programId,
              tokenProgram: TOKEN_PROGRAM_ID,
              rent: SYSVAR_RENT_PUBKEY,
            },
            signers: [buyerNFTAcc]
          });
        console.log(tx)
      }
      catch (err) {
        console.log(err)
      }
    }

    return (
      <Card className="card">
        <div className="nft-price inline">
          <img
            alt=""
            src="../sol.svg"
            width="15"
            height="15"
            className="d-inline-block"
          />{' '}
          {props.ask.toNumber() / LAMPORTS_PER_SOL}
        </div>
        <Container>
          <Card.Img className="nft" src="https://www.arweave.net/N_gPjI27LW-5z-HAVOCYPUOl6viCN_mOA7MxESKDDwU?ext=png" />
        </Container>
        <Card.Body className="card-body justify-content-center">
          <Button className="submit-btn" onClick={() => handleClick()}>Buy</Button>
        </Card.Body>
      </Card>
    );
  }

  function UserListingCard({ props }) {
    console.log("props:", props)
    const [listingPrice, setListingPrice] = useState("");

    async function handleClose() {
      console.log("close")
      console.log(props)
      try {
        // Program
        const provider = await getProvider();
        const program = new Program(idl, programID, provider);

        let sellerNFTAcc = Keypair.generate();

        // Mint + market
        let nftMint = new PublicKey(props.nftMint);
        let market = new PublicKey(props.market)
        // Listing PDA
        let [listing, listingBump] = await PublicKey.findProgramAddress(
          [
            Buffer.from(anchor.utils.bytes.utf8.encode("listing")),
            market.toBuffer(),
            nftMint.toBuffer(),
            provider.wallet.publicKey.toBuffer(),
          ],
          program.programId
        );
        // NFT vault PDA
        let [nftVault, nftVaultBump] = await PublicKey.findProgramAddress(
          [
            Buffer.from(anchor.utils.bytes.utf8.encode("vault")),
            nftMint.toBuffer(),
          ],
          program.programId
        );
        // Close listing
        const tx = await program.rpc.closeListing(
          listingBump,
          nftVaultBump,
          {
            accounts: {
              signer: provider.wallet.publicKey,
              signerNftAcc: sellerNFTAcc.publicKey,
              nftVault: nftVault,
              listing: listing,
              market: market,
              nftMint: nftMint,
              systemProgram: SystemProgram.programId,
              tokenProgram: TOKEN_PROGRAM_ID,
              rent: SYSVAR_RENT_PUBKEY
            },
            signers: [sellerNFTAcc]
          });
        console.log(tx)
      }
      catch (err) {
        console.log(err)
      }

    }
    async function handleUpdate() {
      try {
        let price = new anchor.BN(listingPrice * LAMPORTS_PER_SOL)
        // Program
        const provider = await getProvider();
        const program = new Program(idl, programID, provider);

        // Mint + market
        let nftMint = new PublicKey(props.nftMint);
        let market = new PublicKey(props.market)
        // Listing PDA
        let [listing, listingBump] = await PublicKey.findProgramAddress(
          [
            Buffer.from(anchor.utils.bytes.utf8.encode("listing")),
            market.toBuffer(),
            nftMint.toBuffer(),
            provider.wallet.publicKey.toBuffer(),
          ],
          program.programId
        );
        // Update listing ask
        const tx = await program.rpc.ask(
          price,
          listingBump,
          {
            accounts: {
              signer: provider.wallet.publicKey,
              listing: listing,
              market: market,
              nftMint: nftMint,
              systemProgram: SystemProgram.programId,
              tokenProgram: TOKEN_PROGRAM_ID,
            },
            signers: []
          });
        console.log(tx)
      }
      catch (err) {
        console.log(err)
      }
    }

    return (
      <Card className="card">
        <div className="nft-price inline">
          <img
            alt=""
            src="../sol.svg"
            width="15"
            height="15"
            className="d-inline-block"
          />{' '}
          {props.ask.toNumber() / LAMPORTS_PER_SOL}
        </div>
        <Container>
          <Card.Img className="nft" src="https://cdn.solanamonkey.business/gen2/2986.png" />
        </Container>
        <Card.Body className="card-body justify-content-center">
          <div className="input-group mb-3">
            <input type="text" className="form-control" min="0" placeholder="SOL" value={listingPrice} onChange={event => {
              setListingPrice(event.target.value);
            }}
            ></input>
            <div className="input-group-append">
              <button className="btn btn-outline-secondary" type="button" onClick={(e) => handleUpdate()}>Update</button>
            </div>
          </div>
          <button className="close-btn" type="button" onClick={(e) => handleClose()}>Close listing</button>
        </Card.Body>
      </Card>
    );
  }

  function ActiveListings({ props }) {
    console.log(props)
    if (props.length === 0) {
      return (
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
      )
    }
    else {
      return (
        <Container className="card-container">
          <Row xs={"auto"} md={"auto"} className="row">
            {props.activeListings.map((listing, idx) => (
              <Col className="col top-buffer" key={idx}>
                <ListingCard props={listing} />
              </Col>
            ))}
          </Row>
        </Container >
      );
    }
  }

  function UserListings({ props }) {
    console.log(props)
    if (props.length === 0) {
      return (
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
      )
    }
    else {
      return (
        <Container className="card-container">
          <Row xs={"auto"} md={"auto"} className="row">
            {props.userListings.map((listing, idx) => (
              <Col className="col top-buffer" key={idx}>
                <UserListingCard props={listing} />
              </Col>
            ))}
          </Row>
        </Container >
      );
    }
  }

  function UserNFTs({ props }) {
    if (Object.keys(props).length === 0 && props.constructor === Object) {
      return (
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
      )
    }
    else {
      let tokenAccounts = props.nftTokenAccounts;
      return (
        <Container className="card-container">
          <Row xs={"auto"} md={"auto"} className="row">
            {tokenAccounts.map((acc, idx) => (
              <Col className="col top-buffer" key={idx}>
                <NFTCard props={acc} />
              </Col>
            ))}
          </Row>
        </Container >
      );
    }
  }

  function Buy() {
    return (
      <>
        <ActiveListings props={listings} />
      </>
    );
  }

  function Listings() {
    return (
      <>
        <UserListings props={listings} />
      </>
    );
  }

  function Wallet() {
    return (
      <>
        <UserNFTs props={profile} />
      </>
    );
  }

  if (!wallet.connected) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '100px' }}>
        <WalletMultiButton />
      </div>
    )
  } else {
    return (
      <Container className="container-top">
        <Navbar sticky="top">
          <Container className="nav-container">
            <Navbar.Brand href="/">
              <img
                alt=""
                src="../small.png"
                height="75"
                className="logo d-inline-block align-middle"
              />{' '}
              <img
                alt=""
                src="../logo.png"
                width="190"
                height="25"
                className="logo-banner d-inline-block align-middle"
              />{' '}
            </Navbar.Brand>
            <Nav className="nav-middle">
              <Nav.Link href="/">Buy</Nav.Link>
              <Nav.Link href="/listings">My Listings</Nav.Link>
              <Nav.Link href="/wallet">Wallet</Nav.Link>
            </Nav>
            <a href="https://discord.gg/NJ8cvqPQ">
              <img
                alt=""
                src="../discord1.svg"
                width="35"
                height="35"
                className="logo-banner d-inline-block align-middle"
                href="https://discord.gg/NJ8cvqPQ"
              />{' '}
            </a>
          </Container>
        </Navbar >
        <Routes>
          <Route path="/" element={<Buy />} />
          <Route path="/wallet" element={<Wallet />} />
          <Route path="/listings" element={<Listings />} />
        </Routes>
      </Container >
    );
  }
}

const AppWithProvider = () => (
  <ConnectionProvider endpoint={network}>
    <WalletProvider wallets={wallets} autoConnect>
      <WalletModalProvider>
        <Router>
          <App />
        </Router>
      </WalletModalProvider>
    </WalletProvider>
  </ConnectionProvider>
)

export default AppWithProvider;