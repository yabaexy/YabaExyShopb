import { ethers } from 'ethers';

declare global {
  interface Window {
    ethereum?: any;
  }
}

export const WYDA_CONTRACT_ADDRESS = '0xD84B7E8b295d9Fa9656527AC33Bf4F683aE7d2C4';

export const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint amount)"
];

export async function connectWallet() {
  if (!window.ethereum) {
    throw new Error("MetaMask is not installed. Please install it to use this app.");
  }
  
  const provider = new ethers.BrowserProvider(window.ethereum);
  const accounts = await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  
  return { provider, signer, address };
}

export async function getWYDABalance(address: string, provider: ethers.Provider) {
  const contract = new ethers.Contract(WYDA_CONTRACT_ADDRESS, ERC20_ABI, provider);
  const balance = await contract.balanceOf(address);
  const decimals = await contract.decimals();
  return ethers.formatUnits(balance, decimals);
}

export async function transferWYDA(to: string, amount: string, signer: ethers.Signer) {
  const contract = new ethers.Contract(WYDA_CONTRACT_ADDRESS, ERC20_ABI, signer);
  const decimals = await contract.decimals();
  const parsedAmount = ethers.parseUnits(amount, decimals);
  const tx = await contract.transfer(to, parsedAmount);
  return await tx.wait();
}
