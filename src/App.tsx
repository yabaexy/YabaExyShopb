import { useState, useEffect, useCallback, FormEvent, useMemo, ChangeEvent } from 'react';
import { ethers } from 'ethers';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Wallet, 
  Plus, 
  ShoppingBag, 
  Search, 
  ArrowRight, 
  X, 
  CheckCircle2, 
  AlertCircle,
  ExternalLink,
  Tag,
  Clock,
  User,
  ChevronDown,
  Coins,
  Flame,
  Gamepad2,
  Menu,
  Download,
  Package,
  FileCode,
  RefreshCw,
  MessageSquare,
  Send,
  Heart,
  UserPlus,
  UserMinus,
  Edit3,
  Bell,
  ShieldCheck
} from 'lucide-react';
import { connectWallet, getWYDABalance, transferWYDA, WYDA_CONTRACT_ADDRESS } from './lib/web3';
import { Listing, WalletState, SortOption, UserProfile, PurchaseRecord, Comment, Notification, ListingCategory } from './types';
import { GameCenter } from './components/MiniGames';

const ESCROW_ADDRESS = '0xf44d876365611149ebc396def8edd18a83be91c0';
const ADMIN_ADDRESSES = [
  '0xf44d876365611149ebc396def8edd18a83be91c0',
  '0x8Cda9D8b30272A102e0e05A1392A795c267F14Bf',
  '0x2E9Bff8Bf288ec3AB1Dc540B777f9b48276a6286'
];

const USDT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';
const WYDA_TOKEN_ADDRESS = '0xD84B7E8b295d9Fa9656527AC33Bf4F683aE7d2C4';

// Mock initial data with views/sales
const INITIAL_LISTINGS: Listing[] = [
  {
    id: '1',
    title: 'Vintage Film Camera',
    description: 'A classic 35mm film camera in excellent condition. Perfect for enthusiasts.',
    price: 500,
    imageUrl: 'https://picsum.photos/seed/camera/800/600',
    seller: '0x1234...5678',
    createdAt: Date.now() - 86400000,
    views: 150,
    sales: 0,
    category: 'Living',
    isDigital: false,
  },
  {
    id: '2',
    title: 'Mechanical Keyboard',
    description: 'Custom built mechanical keyboard with tactile switches and RGB lighting.',
    price: 1200,
    imageUrl: 'https://picsum.photos/seed/keyboard/800/600',
    seller: '0xabcd...efgh',
    createdAt: Date.now() - 172800000,
    views: 320,
    sales: 0,
    category: 'Electronics',
    isDigital: false,
  },
  {
    id: '3',
    title: 'Designer Sunglasses',
    description: 'Authentic designer sunglasses, barely worn. Comes with original case.',
    price: 800,
    imageUrl: 'https://picsum.photos/seed/glasses/800/600',
    seller: '0x9876...5432',
    createdAt: Date.now() - 259200000,
    views: 85,
    sales: 0,
    category: 'Living',
    isDigital: false,
  },
  {
    id: '4',
    title: 'Cyberpunk Wallpaper Pack',
    description: 'High-resolution 4K wallpapers for your desktop and mobile.',
    price: 50,
    imageUrl: 'https://picsum.photos/seed/wallpaper/800/600',
    seller: '0x5555...6666',
    createdAt: Date.now() - 500000,
    views: 450,
    sales: 12,
    category: 'Others',
    isDigital: true,
    downloadUrl: 'https://example.com/download/wallpapers.zip'
  }
];

export default function App() {
  const [wallet, setWallet] = useState<WalletState>({
    address: null,
    balance: null,
    isConnected: false,
    profile: null,
  });
  const [listings, setListings] = useState<Listing[]>([]);
  const [isSellModalOpen, setIsSellModalOpen] = useState(false);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | ListingCategory>('all');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null);
  const [view, setView] = useState<'marketplace' | 'swap' | 'profiles' | 'games' | 'escrow'>('marketplace');
  const [userCountry, setUserCountry] = useState<string>('Unknown');
  const [comments, setComments] = useState<Comment[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [profileSearchQuery, setProfileSearchQuery] = useState('');
  const [editingListing, setEditingListing] = useState<Listing | null>(null);
  const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [swapAmount, setSwapAmount] = useState({ usdt: '', wyda: '' });
  const [escrowRecords, setEscrowRecords] = useState<PurchaseRecord[]>([]);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const SWAP_RATE = 354; // 1 USDT = 354 WYDA

  // Load listings and profile from server
  useEffect(() => {
    fetchListings();
    fetchGeo();
    fetchProfiles();

    // Google Translate
    const addGoogleTranslate = () => {
      const script = document.createElement('script');
      script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
      script.async = true;
      document.body.appendChild(script);
      (window as any).googleTranslateElementInit = () => {
        new (window as any).google.translate.TranslateElement(
          { pageLanguage: 'en', layout: (window as any).google.translate.TranslateElement.InlineLayout.SIMPLE },
          'google_translate_element'
        );
      };
    };
    addGoogleTranslate();
  }, []);

  useEffect(() => {
    if (view === 'escrow' && wallet.profile?.role === 'admin') {
      fetchEscrowRecords();
    }
  }, [view, wallet.profile?.role]);

  useEffect(() => {
    if (wallet.address) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 30000); // Poll every 30s
      return () => clearInterval(interval);
    }
  }, [wallet.address]);

  const fetchEscrowRecords = async () => {
    try {
      const res = await fetch('/api/admin/escrow');
      const data = await res.json();
      setEscrowRecords(data);
    } catch (e) {
      console.error('Error fetching escrow records:', e);
    }
  };

  const updateEscrowStatus = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/admin/escrow/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        setStatus({ type: 'success', message: `Escrow status updated to ${status}` });
        fetchEscrowRecords();
      }
    } catch (e) {
      setStatus({ type: 'error', message: 'Failed to update escrow status' });
    }
  };

  const fetchNotifications = async () => {
    if (!wallet.address) return;
    try {
      const res = await fetch(`/api/notifications/${wallet.address}`);
      const data = await res.json();
      setNotifications(data);
    } catch (e) {
      console.error('Failed to fetch notifications', e);
    }
  };

  const markNotificationAsRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    } catch (e) {
      console.error('Failed to mark notification as read', e);
    }
  };

  const markAllAsRead = async () => {
    if (!wallet.address) return;
    try {
      await fetch('/api/notifications/read-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: wallet.address })
      });
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch (e) {
      console.error('Failed to mark all as read', e);
    }
  };

  const fetchProfiles = async (q?: string) => {
    try {
      const url = q ? `/api/profiles?q=${q}` : '/api/profiles';
      const res = await fetch(url);
      const data = await res.json();
      setProfiles(data);
    } catch (e) {
      console.error('Failed to fetch profiles', e);
    }
  };

  const fetchGeo = async () => {
    try {
      const res = await fetch('/api/geo');
      const data = await res.json();
      setUserCountry(data.country);
    } catch (e) {
      console.error('Failed to fetch geo', e);
    }
  };

  const fetchListings = async (q?: string) => {
    try {
      const url = q ? `/api/listings?q=${q}` : '/api/listings';
      const res = await fetch(url);
      const data = await res.json();
      if (data.length === 0 && !q) {
        // Seed with initial listings if empty
        for (const l of INITIAL_LISTINGS) {
          await fetch('/api/listings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(l)
          });
        }
        const freshRes = await fetch('/api/listings');
        const freshData = await freshRes.json();
        setListings(freshData);
      } else {
        setListings(data);
      }
    } catch (e) {
      console.error('Failed to fetch listings', e);
    }
  };

  const fetchComments = async (listingId: string) => {
    try {
      const res = await fetch(`/api/comments/${listingId}`);
      const data = await res.json();
      setComments(data);
    } catch (e) {
      console.error('Failed to fetch comments', e);
    }
  };

  const handleConnect = async () => {
    try {
      setIsLoading(true);
      const { address, provider } = await connectWallet();
      const balance = await getWYDABalance(address, provider);
      
      // Load or create profile from server
      const res = await fetch(`/api/profiles/${address}`);
      let profile: UserProfile;
      const today = new Date().toISOString().split('T')[0];
      const isAdmin = ADMIN_ADDRESSES.some(addr => addr.toLowerCase() === address.toLowerCase());

      if (res.ok) {
        profile = await res.json();
        profile.role = isAdmin ? 'admin' : 'user';
        // Daily Login Logic
        if (profile.lastLoginDate !== today) {
          const lastDate = new Date(profile.lastLoginDate);
          const diffDays = Math.floor((new Date(today).getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (diffDays === 1) {
            profile.loginStreak += 1;
          } else {
            profile.loginStreak = 1;
          }

          const reward = profile.loginStreak >= 7 ? 80 : 50;
          profile.ympBalance += reward;
          profile.lastLoginDate = today;
          profile.gamesCompletedToday = { tetris: false, pong: false, backgammon: false };
          if (!profile.purchases) profile.purchases = [];
          
          setStatus({ type: 'success', message: `Daily Login! Earned ${reward} YMP. Streak: ${profile.loginStreak} days.` });
          await updateProfileOnServer(profile);
        }
      } else {
        profile = {
          address,
          ympBalance: 50, // Initial login reward
          lastLoginDate: today,
          loginStreak: 1,
          gamesCompletedToday: { tetris: false, pong: false, backgammon: false },
          lastGameRewardDate: null,
          purchases: [],
          role: isAdmin ? 'admin' : 'user',
        };
        setStatus({ type: 'success', message: `Welcome! Earned 50 YMP for your first login. ${isAdmin ? 'Admin mode enabled.' : ''}` });
        await updateProfileOnServer(profile);
      }

      setWallet({ address, balance, isConnected: true, profile });
    } catch (error: any) {
      console.error(error);
      setStatus({ type: 'error', message: error.message || 'Failed to connect wallet' });
    } finally {
      setIsLoading(false);
    }
  };

  const updateProfileOnServer = async (newProfile: UserProfile) => {
    await fetch('/api/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newProfile)
    });
  };

  const updateProfile = async (newProfile: UserProfile) => {
    setWallet(prev => ({ ...prev, profile: newProfile }));
    await updateProfileOnServer(newProfile);
    fetchProfiles(); // Refresh profiles list
  };

  const handleUpdateProfileDetails = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!wallet.profile) return;

    const formData = new FormData(e.currentTarget);
    const nickname = formData.get('nickname') as string;
    const avatarUrl = formData.get('avatarUrl') as string;

    const updatedProfile: UserProfile = {
      ...wallet.profile,
      nickname,
      avatarUrl
    };

    await updateProfile(updatedProfile);
    setIsEditProfileModalOpen(false);
    setStatus({ type: 'success', message: 'Profile updated successfully!' });
  };

  const handleFollow = async (targetAddress: string) => {
    if (!wallet.isConnected) {
      handleConnect();
      return;
    }
    try {
      await fetch(`/api/profiles/${targetAddress}/follow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followerAddress: wallet.address })
      });
      // Refresh local profile
      const res = await fetch(`/api/profiles/${wallet.address}`);
      if (res.ok) {
        const profile = await res.json();
        setWallet(prev => ({ ...prev, profile }));
      }
      fetchProfiles();
      setStatus({ type: 'success', message: 'Followed successfully!' });
    } catch (e) {
      setStatus({ type: 'error', message: 'Failed to follow' });
    }
  };

  const handleUnfollow = async (targetAddress: string) => {
    if (!wallet.isConnected) return;
    try {
      await fetch(`/api/profiles/${targetAddress}/unfollow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followerAddress: wallet.address })
      });
      // Refresh local profile
      const res = await fetch(`/api/profiles/${wallet.address}`);
      if (res.ok) {
        const profile = await res.json();
        setWallet(prev => ({ ...prev, profile }));
      }
      fetchProfiles();
      setStatus({ type: 'success', message: 'Unfollowed successfully!' });
    } catch (e) {
      setStatus({ type: 'error', message: 'Failed to unfollow' });
    }
  };

  const handleWishlist = async (listingId: string) => {
    if (!wallet.isConnected) {
      handleConnect();
      return;
    }
    try {
      await fetch(`/api/listings/${listingId}/wishlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: wallet.address })
      });
      // Refresh local profile
      const res = await fetch(`/api/profiles/${wallet.address}`);
      if (res.ok) {
        const profile = await res.json();
        setWallet(prev => ({ ...prev, profile }));
      }
      setStatus({ type: 'success', message: 'Added to wishlist!' });
    } catch (e) {
      setStatus({ type: 'error', message: 'Failed to wishlist' });
    }
  };

  const handleUnwishlist = async (listingId: string) => {
    if (!wallet.isConnected) return;
    try {
      await fetch(`/api/listings/${listingId}/unwishlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: wallet.address })
      });
      // Refresh local profile
      const res = await fetch(`/api/profiles/${wallet.address}`);
      if (res.ok) {
        const profile = await res.json();
        setWallet(prev => ({ ...prev, profile }));
      }
      setStatus({ type: 'success', message: 'Removed from wishlist!' });
    } catch (e) {
      setStatus({ type: 'error', message: 'Failed to unwishlist' });
    }
  };

  const handleBuy = async (listing: Listing) => {
    if (!wallet.isConnected) {
      handleConnect();
      return;
    }

    try {
      setIsLoading(true);
      setStatus({ type: 'info', message: 'Processing payment to Escrow... Please confirm in MetaMask.' });
      
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      
      // Send to Escrow Address
      await transferWYDA(ESCROW_ADDRESS, listing.price.toString(), signer);
      
      // Simulate sending email to loopyfy@proton.me
      console.log('--- SENDING ESCROW NOTIFICATION ---');
      console.log('To: loopyfy@proton.me');
      console.log('Subject: WYDA Escrow Transfer Request');
      console.log(`Seller: ${listing.seller}`);
      console.log(`Price: ${listing.price} WYDA`);
      console.log(`Destination: ${listing.seller} (OAuth linked)`);
      console.log(`Item: ${listing.title}`);
      console.log('-----------------------------------');

      // YMP Reward: 1% of price
      const reward = Math.floor(listing.price * 0.01 * 1000);

      const newPurchase: PurchaseRecord = {
        id: Math.random().toString(36).substr(2, 9),
        listingId: listing.id,
        title: listing.title,
        price: listing.price,
        date: Date.now(),
        category: listing.category,
        isDigital: listing.isDigital,
        downloadUrl: listing.downloadUrl,
        buyerAddress: wallet.address!,
        sellerAddress: listing.seller,
        status: 'escrow_pending'
      };

      // Update server state
      await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purchase: newPurchase, buyerAddress: wallet.address })
      });

      await fetchListings();
      setSelectedListing(null);
      
      // Add to purchase history locally
      if (wallet.profile) {
        const newProfile = { 
          ...wallet.profile, 
          ympBalance: wallet.profile.ympBalance + reward,
          purchases: [newPurchase, ...(wallet.profile.purchases || [])]
        };
        updateProfile(newProfile);
      }

      // Refresh balance
      const newBalance = await getWYDABalance(wallet.address!, provider);
      setWallet(prev => ({ ...prev, balance: newBalance }));
      
      setStatus({ type: 'success', message: `Purchased! Earned ${reward} YMP reward.` });
    } catch (error: any) {
      console.error(error);
      setStatus({ type: 'error', message: error.message || 'Transaction failed' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddListing = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const newListing: Listing = {
      id: editingListing ? editingListing.id : Math.random().toString(36).substr(2, 9),
      title: formData.get('title') as string,
      description: formData.get('description') as string,
      price: Number(formData.get('price')),
      imageUrl: uploadedImage || (editingListing ? editingListing.imageUrl : `https://picsum.photos/seed/${Math.random()}/800/600`),
      seller: wallet.address || 'Anonymous',
      createdAt: editingListing ? editingListing.createdAt : Date.now(),
      views: editingListing ? editingListing.views : 0,
      sales: editingListing ? editingListing.sales : 0,
      category: formData.get('category') as ListingCategory,
      isDigital: formData.get('isDigital') === 'on',
      downloadUrl: formData.get('downloadUrl') as string || undefined,
      allowBidding: formData.get('allowBidding') === 'on',
      allowCustomOrder: formData.get('allowCustomOrder') === 'on',
    };

    await fetch('/api/listings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newListing)
    });

    await fetchListings();
    setIsSellModalOpen(false);
    setEditingListing(null);
    setUploadedImage(null);
    setStatus({ type: 'success', message: editingListing ? 'Item updated successfully!' : 'Item listed successfully!' });
  };

  const sortedListings = useMemo(() => {
    let result = [...listings];
    
    // Filter by search
    if (searchQuery) {
      result = result.filter(l => 
        l.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by category
    if (selectedCategory !== 'all') {
      result = result.filter(l => l.category === selectedCategory);
    }

    // Sort
    switch (sortBy) {
      case 'price-low':
        result.sort((a, b) => a.price - b.price);
        break;
      case 'price-high':
        result.sort((a, b) => b.price - a.price);
        break;
      case 'popular':
        result.sort((a, b) => b.views - a.views);
        break;
      case 'newest':
      default:
        result.sort((a, b) => b.createdAt - a.createdAt);
        break;
    }
    
    return result;
  }, [listings, searchQuery, sortBy, selectedCategory]);

  const handlePlaceBid = async (listing: Listing, amount: number) => {
    if (!wallet.isConnected) {
      handleConnect();
      return;
    }

    if (amount <= (listing.highestBid || listing.price)) {
      setStatus({ type: 'error', message: 'Bid must be higher than current price' });
      return;
    }

    try {
      setIsLoading(true);
      setStatus({ type: 'info', message: 'Placing bid... Please confirm in MetaMask.' });
      
      await fetch(`/api/listings/${listing.id}/bid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, bidder: wallet.address })
      });
      
      await fetchListings();
      setSelectedListing(prev => prev ? { ...prev, highestBid: amount, highestBidder: wallet.address! } : null);
      setStatus({ type: 'success', message: `Bid of ${amount} WYDA placed successfully!` });
    } catch (error: any) {
      console.error(error);
      setStatus({ type: 'error', message: error.message || 'Failed to place bid' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCustomOrder = (listing: Listing) => {
    setStatus({ type: 'info', message: `Custom order request sent to seller for ${listing.title}. They will contact you via your wallet address.` });
  };

  const handleAddComment = async (listingId: string, text: string) => {
    if (!wallet.isConnected) {
      handleConnect();
      return;
    }

    const newComment: Comment = {
      id: Math.random().toString(36).substr(2, 9),
      listingId,
      authorAddress: wallet.address!,
      text,
      timestamp: Date.now(),
    };

    await fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newComment)
    });

    await fetchComments(listingId);
  };

  const handleViewListing = async (listing: Listing) => {
    await fetch(`/api/listings/${listing.id}/view`, { method: 'POST' });
    await fetchListings();
    setSelectedListing(listing);
    fetchComments(listing.id);
  };

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-bg/80 backdrop-blur-md border-b border-line">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden p-2 hover:bg-ink/5 rounded-lg transition-colors"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-bg font-bold">E</div>
              <span className="font-bold text-xl tracking-tight uppercase">Exyon Market</span>
            </div>
            <div id="google_translate_element" className="hidden lg:block ml-4" />
          </div>

          <div className="hidden md:flex items-center gap-6">
            <button 
              onClick={() => setView('marketplace')}
              className={`text-sm font-bold uppercase tracking-widest transition-colors ${view === 'marketplace' ? 'text-primary' : 'text-ink/60 hover:text-primary'}`}
            >
              Market
            </button>
            <button 
              onClick={() => setView('profiles')}
              className={`text-sm font-bold uppercase tracking-widest transition-colors ${view === 'profiles' ? 'text-primary' : 'text-ink/60 hover:text-primary'}`}
            >
              Profiles
            </button>
            <button 
              onClick={() => setView('games')}
              className={`text-sm font-bold uppercase tracking-widest transition-colors ${view === 'games' ? 'text-primary' : 'text-ink/60 hover:text-primary'}`}
            >
              Games
            </button>
            <button 
              onClick={() => setView('swap')}
              className={`text-sm font-bold uppercase tracking-widest transition-colors ${view === 'swap' ? 'text-primary' : 'text-ink/60 hover:text-primary'}`}
            >
              Swap
            </button>
            {wallet.profile?.role === 'admin' && (
              <button 
                onClick={() => setView('escrow')}
                className={`text-sm font-bold uppercase tracking-widest transition-colors ${view === 'escrow' ? 'text-primary' : 'text-ink/60 hover:text-primary'}`}
              >
                Escrow
              </button>
            )}
          </div>

          <div className="hidden md:flex flex-1 max-w-md mx-8">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/40" />
              <input 
                type="text" 
                placeholder={view === 'profiles' ? "Search profiles..." : "Search items..."} 
                className="w-full bg-ink/5 border border-line/20 rounded-full py-2 pl-10 pr-4 focus:outline-none focus:border-primary transition-colors"
                value={view === 'profiles' ? profileSearchQuery : searchQuery}
                onChange={(e) => {
                  if (view === 'profiles') {
                    setProfileSearchQuery(e.target.value);
                    fetchProfiles(e.target.value);
                  } else {
                    setSearchQuery(e.target.value);
                    fetchListings(e.target.value);
                  }
                }}
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            {wallet.isConnected ? (
              <div className="flex items-center gap-3">
                <div className="relative">
                  <button 
                    onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                    className="p-2 hover:bg-ink/5 rounded-full transition-colors relative"
                  >
                    <Bell className="w-6 h-6" />
                    {notifications.some(n => !n.isRead) && (
                      <span className="absolute top-1 right-1 w-3 h-3 bg-red-500 border-2 border-bg rounded-full" />
                    )}
                  </button>

                  <AnimatePresence>
                    {isNotificationsOpen && (
                      <>
                        <div 
                          className="fixed inset-0 z-40" 
                          onClick={() => setIsNotificationsOpen(false)} 
                        />
                        <motion.div 
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          className="absolute right-0 mt-2 w-80 bg-bg border border-line rounded-2xl shadow-2xl z-50 overflow-hidden"
                        >
                          <div className="p-4 border-b border-line flex justify-between items-center">
                            <h3 className="font-bold uppercase text-xs tracking-widest">Notifications</h3>
                            <button 
                              onClick={markAllAsRead}
                              className="text-[10px] font-bold text-primary hover:underline uppercase"
                            >
                              Mark all as read
                            </button>
                          </div>
                          <div className="max-h-96 overflow-y-auto scrollbar-thin">
                            {notifications.length > 0 ? (
                              notifications.map(n => (
                                <div 
                                  key={n.id} 
                                  onClick={() => {
                                    markNotificationAsRead(n.id);
                                    if (n.listingId) {
                                      const listing = listings.find(l => l.id === n.listingId);
                                      if (listing) handleViewListing(listing);
                                    }
                                    setIsNotificationsOpen(false);
                                  }}
                                  className={`p-4 border-b border-line/5 cursor-pointer transition-colors ${n.isRead ? 'opacity-60' : 'bg-primary/5'}`}
                                >
                                  <p className="text-sm leading-tight mb-1">{n.message}</p>
                                  <span className="text-[10px] opacity-40">{new Date(n.timestamp).toLocaleString()}</span>
                                </div>
                              ))
                            ) : (
                              <div className="p-8 text-center opacity-40 italic text-sm">
                                No notifications yet
                              </div>
                            )}
                          </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>

                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setIsSellModalOpen(true)}
                    className="w-10 h-10 bg-primary text-bg rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-lg"
                    title="List an Item"
                  >
                    <Plus className="w-6 h-6" />
                  </button>
                  <div className="hidden sm:flex flex-col items-end">
                    <div className="flex items-center gap-1 text-primary">
                      <Coins className="w-3 h-3" />
                      <span className="font-mono font-bold text-xs">{wallet.profile?.ympBalance} YMP</span>
                    </div>
                    <span className="font-mono font-bold text-sm">{Number(wallet.balance).toFixed(2)} WYDA</span>
                  </div>
                  <div className="h-10 px-4 bg-ink text-bg rounded-full flex items-center gap-2 font-mono text-sm border border-line">
                    <Wallet className="w-4 h-4" />
                    {wallet.address?.slice(0, 6)}...{wallet.address?.slice(-4)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setIsSellModalOpen(true)}
                  className="w-10 h-10 bg-primary text-bg rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-lg"
                  title="List an Item"
                >
                  <Plus className="w-6 h-6" />
                </button>
                <button 
                  onClick={handleConnect}
                  disabled={isLoading}
                  className="h-10 px-6 bg-primary text-bg rounded-full font-bold hover:opacity-90 transition-opacity flex items-center gap-2 disabled:opacity-50"
                >
                  <Wallet className="w-4 h-4" />
                  Connect Wallet
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Sidebar */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 z-[60] bg-ink/60 backdrop-blur-sm md:hidden"
            />
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 left-0 bottom-0 z-[70] w-72 bg-bg border-r border-line p-6 md:hidden overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-bg font-bold">E</div>
                  <span className="font-bold text-lg uppercase">Exyon Market</span>
                </div>
                <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 hover:bg-ink/5 rounded-full">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <h3 className="text-[10px] uppercase font-bold opacity-40 mb-4 tracking-widest">Navigation</h3>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => { setView('marketplace'); setIsMobileMenuOpen(false); }}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-colors ${
                        view === 'marketplace' ? 'bg-primary text-bg' : 'bg-ink/5 hover:bg-ink/10'
                      }`}
                    >
                      <ShoppingBag className="w-4 h-4" />
                      Marketplace
                    </button>
                    <button
                      onClick={() => { setView('profiles'); setIsMobileMenuOpen(false); }}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-colors ${
                        view === 'profiles' ? 'bg-primary text-bg' : 'bg-ink/5 hover:bg-ink/10'
                      }`}
                    >
                      <User className="w-4 h-4" />
                      Profiles
                    </button>
                    <button
                      onClick={() => { setView('games'); setIsMobileMenuOpen(false); }}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-colors ${
                        view === 'games' ? 'bg-primary text-bg' : 'bg-ink/5 hover:bg-ink/10'
                      }`}
                    >
                      <Gamepad2 className="w-4 h-4" />
                      Games
                    </button>
                    <button
                      onClick={() => { setView('swap'); setIsMobileMenuOpen(false); }}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-colors ${
                        view === 'swap' ? 'bg-primary text-bg' : 'bg-ink/5 hover:bg-ink/10'
                      }`}
                    >
                      <RefreshCw className="w-4 h-4" />
                      Swap
                    </button>
                    {wallet.profile?.role === 'admin' && (
                      <button
                        onClick={() => { setView('escrow'); setIsMobileMenuOpen(false); }}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-colors ${
                          view === 'escrow' ? 'bg-primary text-bg' : 'bg-ink/5 hover:bg-ink/10'
                        }`}
                      >
                        <ShieldCheck className="w-4 h-4" />
                        Escrow
                      </button>
                    )}
                  </div>
                </div>

                {wallet.isConnected && wallet.profile && (
                  <div>
                    <h3 className="text-[10px] uppercase font-bold opacity-40 mb-4 tracking-widest">Your Account</h3>
                    <div className="space-y-2">
                      <div className="p-4 bg-ink/5 rounded-xl">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[10px] font-bold opacity-40 uppercase">YMP Balance</span>
                          <span className="font-mono font-bold text-primary">{wallet.profile.ympBalance}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold opacity-40 uppercase">WYDA Balance</span>
                          <span className="font-mono font-bold">{Number(wallet.balance).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8 grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-3">
          {view === 'marketplace' ? (
            <>
              {/* Status Toast */}
          <AnimatePresence>
            {status && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className={`mb-8 p-4 rounded-xl border flex items-center justify-between ${
                  status.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-700' :
                  status.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-700' :
                  'bg-blue-500/10 border-blue-500/20 text-blue-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  {status.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : 
                   status.type === 'error' ? <AlertCircle className="w-5 h-5" /> : 
                   <Clock className="w-5 h-5" />}
                  <p className="font-medium">{status.message}</p>
                </div>
                <button onClick={() => setStatus(null)}><X className="w-4 h-4" /></button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Hero */}
          <section className="mb-12">
            <div className="bg-ink text-bg rounded-3xl p-8 md:p-12 relative overflow-hidden">
              <div className="relative z-10 max-w-2xl">
                <h1 className="text-4xl md:text-6xl font-bold tracking-tighter mb-4 leading-none">
                  TRADE SECOND-HAND <br />
                  <span className="text-primary italic">WITH WYDA TOKEN</span>
                </h1>
                <p className="text-bg/60 text-lg mb-8 max-w-lg">
                  The most secure way to buy and sell pre-loved items on Binance Smart Chain. 
                  Zero middleman, instant settlements.
                </p>
                <div className="flex flex-wrap gap-4">
                  {/* List an Item button moved to header */}
                </div>
              </div>
              <div className="absolute top-0 right-0 w-1/2 h-full opacity-20 pointer-events-none">
                <div className="absolute top-1/2 right-0 -translate-y-1/2 w-96 h-96 bg-primary rounded-full blur-[120px]" />
              </div>
            </div>
          </section>

          {/* Listings Grid */}
          <section>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
              <div className="flex items-center gap-4 overflow-x-auto pb-2 sm:pb-0 scrollbar-hide">
                {(['all', 'Living', 'Automotive', 'Electronics', 'Others'] as const).map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${
                      selectedCategory === cat ? 'bg-primary text-bg' : 'bg-white border border-line/10 hover:border-primary/50'
                    }`}
                  >
                    <span className="capitalize">{cat}</span>
                  </button>
                ))}
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold opacity-40">Sort By:</span>
                <div className="relative">
                  <select 
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    className="appearance-none bg-white border border-line/10 rounded-full px-4 py-2 pr-10 text-sm font-bold focus:outline-none focus:border-primary cursor-pointer"
                  >
                    <option value="newest">Newest</option>
                    <option value="price-low">Price: Low to High</option>
                    <option value="price-high">Price: High to Low</option>
                    <option value="popular">Most Popular</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none opacity-50" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {sortedListings.map((listing) => (
                <motion.div 
                  layoutId={listing.id}
                  key={listing.id}
                  onClick={() => handleViewListing(listing)}
                  className="group cursor-pointer bg-white border border-line/10 rounded-2xl overflow-hidden hover:border-primary/50 transition-colors"
                >
                  <div className="aspect-[4/3] overflow-hidden relative">
                    <img 
                      src={listing.imageUrl} 
                      alt={listing.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute top-4 right-4 flex flex-col gap-2">
                      <div className="bg-primary text-bg px-3 py-1 rounded-full font-mono font-bold text-sm shadow-lg">
                        {listing.price} WYDA
                      </div>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          const isWishlisted = wallet.profile?.wishlist?.includes(listing.id);
                          if (isWishlisted) handleUnwishlist(listing.id);
                          else handleWishlist(listing.id);
                        }}
                        className={`w-8 h-8 rounded-full flex items-center justify-center shadow-lg transition-colors ${
                          wallet.profile?.wishlist?.includes(listing.id) ? 'bg-red-500 text-bg' : 'bg-white text-ink hover:text-red-500'
                        }`}
                      >
                        <Heart className={`w-4 h-4 ${wallet.profile?.wishlist?.includes(listing.id) ? 'fill-current' : ''}`} />
                      </button>
                    </div>
                    {listing.views > 100 && (
                      <div className="absolute top-4 left-4 bg-ink/80 backdrop-blur-sm text-primary px-2 py-1 rounded-md flex items-center gap-1 text-[10px] font-bold uppercase">
                        <Flame className="w-3 h-3" /> Popular
                      </div>
                    )}
                    {listing.isDigital && (
                      <div className="absolute bottom-4 left-4 bg-blue-500/80 backdrop-blur-sm text-bg px-2 py-1 rounded-md flex items-center gap-1 text-[10px] font-bold uppercase">
                        <FileCode className="w-3 h-3" /> Digital
                      </div>
                    )}
                  </div>
                  <div className="p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <Tag className="w-3 h-3 text-primary" />
                      <span className="text-[10px] uppercase font-bold opacity-40 tracking-widest">
                        {listing.category}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold mb-2 group-hover:text-primary transition-colors">{listing.title}</h3>
                    <p className="text-ink/60 text-sm line-clamp-2 mb-4">{listing.description}</p>
                    <div className="flex items-center justify-between pt-4 border-t border-line/5">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1 opacity-40 text-[10px] font-mono">
                          <Search className="w-3 h-3" /> {listing.views}
                        </div>
                        <span className="text-xs font-mono opacity-50">
                          {profiles.find(p => p.address === listing.seller)?.nickname || `${listing.seller.slice(0, 6)}...`}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-primary font-bold text-sm">
                        View <ArrowRight className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>
            </>
          ) : view === 'profiles' ? (
            <section className="py-12">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-3xl font-bold uppercase tracking-tight">Community Profiles</h2>
                <div className="text-sm font-mono opacity-50">{profiles.length} Users Found</div>
              </div>

              {wallet.isConnected && wallet.profile && (
                <div className="mb-12 bg-white border-2 border-primary/20 rounded-3xl overflow-hidden shadow-xl">
                  <div className="p-6 bg-primary/5 border-b border-line/10 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 bg-white border border-line/10 rounded-2xl overflow-hidden flex items-center justify-center">
                        {wallet.profile.avatarUrl ? (
                          <img src={wallet.profile.avatarUrl} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <User className="w-8 h-8 text-primary" />
                        )}
                      </div>
                      <div>
                        <h3 className="text-2xl font-bold tracking-tight uppercase">
                          {wallet.profile.nickname || 'Your Profile'}
                        </h3>
                        <p className="text-xs font-mono opacity-50">{wallet.address}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setIsEditProfileModalOpen(true)}
                      className="px-6 py-2 bg-primary text-bg rounded-full font-bold text-xs hover:opacity-90 transition-opacity flex items-center gap-2"
                    >
                      <Edit3 className="w-4 h-4" /> Edit Profile
                    </button>
                  </div>
                  <div className="p-8 grid grid-cols-2 sm:grid-cols-4 gap-6">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase font-bold opacity-40">Role</span>
                      <span className={`font-mono font-bold ${wallet.profile.role === 'admin' ? 'text-red-500' : 'text-ink'}`}>
                        {wallet.profile.role.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase font-bold opacity-40">Followers</span>
                      <span className="font-mono font-bold text-primary">{wallet.profile.followersCount || 0}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase font-bold opacity-40">YMP Points</span>
                      <span className="font-mono font-bold text-primary">{wallet.profile.ympBalance}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase font-bold opacity-40">Streak</span>
                      <div className="flex items-center gap-1">
                        <Flame className="w-4 h-4 text-orange-500" />
                        <span className="font-mono font-bold">{wallet.profile.loginStreak} Days</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-8 pt-0 border-t border-line/5">
                    <h4 className="text-[10px] uppercase font-bold opacity-40 mb-4 tracking-widest pt-6">Your Active Listings</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
                      {listings.filter(l => l.seller === wallet.address).map(l => (
                        <div key={l.id} className="group relative aspect-square rounded-2xl overflow-hidden border border-line/10 bg-ink/5">
                          <img src={l.imageUrl} alt={l.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform" referrerPolicy="no-referrer" />
                          <div className="absolute inset-0 bg-ink/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2 text-center">
                            <span className="text-[10px] font-bold text-bg line-clamp-2">{l.title}</span>
                          </div>
                        </div>
                      ))}
                      {listings.filter(l => l.seller === wallet.address).length === 0 && (
                        <div className="col-span-full py-8 text-center bg-ink/5 rounded-2xl border-2 border-dashed border-line/10">
                          <p className="text-xs opacity-40 italic">You haven't listed any items yet.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {profiles.map(profile => (
                  <div key={profile.address} className="bg-white border border-line/10 rounded-3xl p-6 hover:border-primary/50 transition-colors">
                    <div className="w-16 h-16 bg-ink/5 rounded-2xl flex items-center justify-center mb-4 overflow-hidden">
                      {profile.avatarUrl ? (
                        <img src={profile.avatarUrl} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <User className="w-8 h-8 text-primary" />
                      )}
                    </div>
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-bold text-sm truncate">{profile.nickname || profile.address.slice(0, 10) + '...'}</h3>
                      {profile.role === 'admin' && (
                        <span className="text-[8px] font-bold bg-red-500 text-bg px-1 rounded">ADMIN</span>
                      )}
                    </div>
                    <p className="text-[10px] font-mono opacity-40 mb-4 truncate">{profile.address}</p>
                    <div className="flex items-center gap-4 mb-6">
                      <div className="text-[10px] uppercase font-bold opacity-40">
                        Followers <span className="text-ink opacity-100">{profile.followersCount || 0}</span>
                      </div>
                      <div className="text-[10px] uppercase font-bold opacity-40">
                        Following <span className="text-ink opacity-100">{profile.followingCount || 0}</span>
                      </div>
                    </div>

                    <div className="mb-6">
                      <h4 className="text-[10px] uppercase font-bold opacity-40 mb-2 tracking-widest">Active Listings</h4>
                      <div className="flex flex-wrap gap-2">
                        {listings.filter(l => l.seller === profile.address).slice(0, 3).map(l => (
                          <div key={l.id} className="w-10 h-10 rounded-lg overflow-hidden border border-line/10" title={l.title}>
                            <img src={l.imageUrl} alt={l.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          </div>
                        ))}
                        {listings.filter(l => l.seller === profile.address).length > 3 && (
                          <div className="w-10 h-10 rounded-lg bg-ink/5 flex items-center justify-center text-[10px] font-bold opacity-40">
                            +{listings.filter(l => l.seller === profile.address).length - 3}
                          </div>
                        )}
                        {listings.filter(l => l.seller === profile.address).length === 0 && (
                          <p className="text-[10px] opacity-30 italic">No active listings</p>
                        )}
                      </div>
                    </div>
                    
                    {wallet.isConnected && wallet.address !== profile.address && (
                      <button 
                        onClick={() => {
                          const isFollowing = wallet.profile?.following?.includes(profile.address);
                          if (isFollowing) handleUnfollow(profile.address);
                          else handleFollow(profile.address);
                        }}
                        className={`w-full py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-opacity ${
                          wallet.profile?.following?.includes(profile.address) 
                            ? 'bg-ink/10 text-ink hover:bg-ink/20' 
                            : 'bg-primary text-bg hover:opacity-90'
                        }`}
                      >
                        {wallet.profile?.following?.includes(profile.address) ? (
                          <><UserMinus className="w-4 h-4" /> Unfollow</>
                        ) : (
                          <><UserPlus className="w-4 h-4" /> Follow</>
                        )}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ) : view === 'games' ? (
            <section className="py-12">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-3xl font-bold uppercase tracking-tight">Game Center</h2>
                <div className="text-sm font-mono opacity-50">Play & Earn YMP</div>
              </div>
              {wallet.isConnected && wallet.profile ? (
                <GameCenter profile={wallet.profile} onUpdateProfile={updateProfile} />
              ) : (
                <div className="bg-white border border-line/10 rounded-3xl p-12 text-center">
                  <Gamepad2 className="w-16 h-16 text-primary mx-auto mb-4" />
                  <h3 className="text-2xl font-bold mb-2">Connect Wallet to Play</h3>
                  <p className="text-ink/60 mb-8">You need to be connected to earn YMP rewards from mini-games.</p>
                  <button 
                    onClick={handleConnect}
                    className="px-8 py-4 bg-primary text-bg rounded-full font-bold hover:opacity-90 transition-opacity"
                  >
                    Connect Wallet
                  </button>
                </div>
              )}
            </section>
          ) : view === 'escrow' ? (
            <section className="py-12">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-3xl font-bold uppercase tracking-tight">Escrow Management</h2>
                <div className="text-sm font-mono opacity-50">{escrowRecords.length} Records Found</div>
              </div>

              <div className="space-y-12">
                {/* Pending Table */}
                <div className="bg-white border border-line/10 rounded-3xl overflow-hidden">
                  <div className="p-6 border-b border-line/10 bg-ink/5">
                    <h3 className="font-bold uppercase text-sm tracking-widest flex items-center gap-2">
                      <Clock className="w-4 h-4 text-orange-500" />
                      Pending Escrow
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-line/10 text-[10px] uppercase font-bold opacity-40">
                          <th className="px-6 py-4">Item</th>
                          <th className="px-6 py-4">Price</th>
                          <th className="px-6 py-4">Buyer (Refund To)</th>
                          <th className="px-6 py-4">Seller (Pay To)</th>
                          <th className="px-6 py-4">Status</th>
                          <th className="px-6 py-4">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line/5">
                        {escrowRecords.filter(r => r.status === 'escrow_pending').map(record => (
                          <tr key={record.id} className="hover:bg-ink/5 transition-colors">
                            <td className="px-6 py-4 font-bold">{record.title}</td>
                            <td className="px-6 py-4 font-mono text-primary">{record.price} WYDA</td>
                            <td className="px-6 py-4 font-mono text-[10px]">{record.buyerAddress}</td>
                            <td className="px-6 py-4 font-mono text-[10px]">{record.sellerAddress}</td>
                            <td className="px-6 py-4">
                              <span className="px-2 py-1 bg-orange-500/10 text-orange-600 rounded text-[10px] font-bold uppercase">Pending</span>
                            </td>
                            <td className="px-6 py-4">
                              <button 
                                onClick={() => updateEscrowStatus(record.id, 'shipped')}
                                className="text-xs font-bold text-primary hover:underline"
                              >
                                Mark Shipped
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Shipped Table */}
                <div className="bg-white border border-line/10 rounded-3xl overflow-hidden">
                  <div className="p-6 border-b border-line/10 bg-ink/5">
                    <h3 className="font-bold uppercase text-sm tracking-widest flex items-center gap-2">
                      <Package className="w-4 h-4 text-blue-500" />
                      Shipped / In Progress
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-line/10 text-[10px] uppercase font-bold opacity-40">
                          <th className="px-6 py-4">Item</th>
                          <th className="px-6 py-4">Price</th>
                          <th className="px-6 py-4">Buyer</th>
                          <th className="px-6 py-4">Seller</th>
                          <th className="px-6 py-4">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line/5">
                        {escrowRecords.filter(r => r.status === 'shipped').map(record => (
                          <tr key={record.id} className="hover:bg-ink/5 transition-colors">
                            <td className="px-6 py-4 font-bold">{record.title}</td>
                            <td className="px-6 py-4 font-mono text-primary">{record.price} WYDA</td>
                            <td className="px-6 py-4 font-mono text-[10px]">{record.buyerAddress}</td>
                            <td className="px-6 py-4 font-mono text-[10px]">{record.sellerAddress}</td>
                            <td className="px-6 py-4 flex gap-4">
                              <button 
                                onClick={() => updateEscrowStatus(record.id, 'completed')}
                                className="text-xs font-bold text-green-600 hover:underline"
                              >
                                Complete (Pay Seller)
                              </button>
                              <button 
                                onClick={() => updateEscrowStatus(record.id, 'refunded')}
                                className="text-xs font-bold text-red-600 hover:underline"
                              >
                                Refund Buyer
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* History Table */}
                <div className="bg-white border border-line/10 rounded-3xl overflow-hidden">
                  <div className="p-6 border-b border-line/10 bg-ink/5">
                    <h3 className="font-bold uppercase text-sm tracking-widest flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      Escrow History
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-line/10 text-[10px] uppercase font-bold opacity-40">
                          <th className="px-6 py-4">Item</th>
                          <th className="px-6 py-4">Price</th>
                          <th className="px-6 py-4">Status</th>
                          <th className="px-6 py-4">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line/5">
                        {escrowRecords.filter(r => r.status === 'completed' || r.status === 'refunded').map(record => (
                          <tr key={record.id} className="hover:bg-ink/5 transition-colors">
                            <td className="px-6 py-4 font-bold">{record.title}</td>
                            <td className="px-6 py-4 font-mono text-primary">{record.price} WYDA</td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                                record.status === 'completed' ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'
                              }`}>
                                {record.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 opacity-50">{new Date(record.date).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </section>
          ) : (
            <section className="bg-white border border-line/10 rounded-3xl p-8 md:p-12">
              <div className="max-w-xl mx-auto">
                <h2 className="text-3xl font-bold mb-2 tracking-tight uppercase flex items-center gap-3">
                  <RefreshCw className="w-8 h-8 text-primary" />
                  Token Swap
                </h2>
                <p className="text-ink/60 mb-8">Swap your tokens securely on Binance Smart Chain.</p>

                <div className="space-y-8">
                  <div className="p-6 bg-ink/5 rounded-2xl border border-line/10">
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-xs font-bold uppercase opacity-40">Direct Swap (1 USDT = {SWAP_RATE} WYDA)</span>
                      <div className="flex items-center gap-1 text-primary text-[10px] font-bold uppercase">
                        <CheckCircle2 className="w-3 h-3" /> Guaranteed Rate
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="relative">
                        <input 
                          type="number" 
                          placeholder="0.00" 
                          className="w-full bg-white border border-line/10 rounded-xl p-4 pr-16 font-mono focus:outline-none focus:border-primary"
                          value={swapAmount.usdt}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSwapAmount({
                              usdt: val,
                              wyda: val ? (Number(val) * SWAP_RATE).toFixed(2) : ''
                            });
                          }}
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-xs opacity-40">USDT</span>
                      </div>
                      <div className="flex justify-center">
                        <div className="w-8 h-8 bg-ink text-bg rounded-full flex items-center justify-center">
                          <ArrowRight className="w-4 h-4 rotate-90" />
                        </div>
                      </div>
                      <div className="relative">
                        <input 
                          type="number" 
                          placeholder="0.00" 
                          className="w-full bg-white border border-line/10 rounded-xl p-4 pr-16 font-mono focus:outline-none focus:border-primary"
                          value={swapAmount.wyda}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSwapAmount({
                              wyda: val,
                              usdt: val ? (Number(val) / SWAP_RATE).toFixed(4) : ''
                            });
                          }}
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-xs opacity-40">WYDA</span>
                      </div>
                      <button 
                        onClick={() => setStatus({ type: 'info', message: 'Direct swap feature coming soon! Please use ApeSwap for now.' })}
                        className="w-full py-4 bg-ink text-bg rounded-full font-bold hover:bg-primary transition-colors"
                      >
                        Swap Tokens
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <a 
                      href={`https://apeswap.finance/swap?outputCurrency=${WYDA_TOKEN_ADDRESS}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex flex-col items-center justify-center p-6 bg-white border border-line/10 rounded-2xl hover:border-primary transition-colors group"
                    >
                      <ExternalLink className="w-6 h-6 text-primary mb-2 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-bold uppercase">ApeSwap</span>
                    </a>
                    <a 
                      href="https://yadacoin.io/unwrap"
                      target="_blank"
                      rel="noreferrer"
                      className="flex flex-col items-center justify-center p-6 bg-white border border-line/10 rounded-2xl hover:border-primary transition-colors group"
                    >
                      <RefreshCw className="w-6 h-6 text-primary mb-2 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-bold uppercase">Unwrap</span>
                    </a>
                  </div>

                  <a 
                    href="https://x.com/YadaLoverz26/status/2013970257140953561"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-2 p-4 bg-primary/5 border border-primary/20 rounded-2xl hover:bg-primary/10 transition-colors group"
                  >
                    <FileCode className="w-5 h-5 text-primary" />
                    <span className="text-xs font-bold uppercase tracking-widest">How to Unwrap (Guide)</span>
                    <ExternalLink className="w-3 h-3 opacity-40 group-hover:translate-x-1 transition-transform" />
                  </a>

                  {userCountry === 'KR' && (
                    <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                      <p className="text-xs opacity-70">
                        <strong>Notice for KR Users:</strong> Direct swap might be restricted. Please use ApeSwap for guaranteed liquidity.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Sidebar */}
        <aside className="lg:col-span-1 space-y-8">
          {wallet.isConnected && wallet.profile && (
            <div className="bg-white border border-line/10 rounded-3xl p-6">
              <div className="flex items-center gap-3 mb-6">
                <ShoppingBag className="w-6 h-6 text-primary" />
                <h2 className="text-xl font-bold uppercase tracking-tight">Purchase History</h2>
              </div>
              
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 scrollbar-thin">
                {wallet.profile.purchases && wallet.profile.purchases.length > 0 ? (
                  wallet.profile.purchases.map(purchase => (
                    <div key={purchase.id} className="p-3 bg-ink/5 rounded-xl border border-line/5">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="text-sm font-bold line-clamp-1">{purchase.title}</h4>
                        <span className="text-[10px] font-mono opacity-50">{new Date(purchase.date).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-primary">{purchase.price} WYDA</span>
                        {purchase.isDigital && purchase.downloadUrl && (
                          <a 
                            href={purchase.downloadUrl} 
                            target="_blank" 
                            rel="noreferrer"
                            className="flex items-center gap-1 text-[10px] font-bold uppercase bg-ink text-bg px-2 py-1 rounded-lg hover:bg-primary transition-colors"
                          >
                            <Download className="w-3 h-3" /> Download
                          </a>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs opacity-50 text-center py-4 italic">No purchases yet</p>
                )}
              </div>
            </div>
          )}

          {!wallet.isConnected && (
            <div className="bg-primary/5 border border-primary/20 rounded-3xl p-8 text-center">
              <Gamepad2 className="w-12 h-12 text-primary mx-auto mb-4" />
              <h3 className="text-xl font-bold mb-2">Join the Community</h3>
              <p className="text-sm opacity-60 mb-6">Connect your wallet to earn YMP points, play daily games, and start trading.</p>
              <button 
                onClick={handleConnect}
                className="w-full py-3 bg-primary text-bg rounded-full font-bold"
              >
                Connect Now
              </button>
            </div>
          )}
        </aside>
      </main>

      {/* Footer */}
      <footer className="bg-ink text-bg/40 py-12 border-t border-line">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-2 mb-4 text-bg">
              <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center text-bg font-bold text-xs">E</div>
              <span className="font-bold text-lg tracking-tight uppercase">Exyon Market</span>
            </div>
            <p className="max-w-sm mb-6">
              The premier decentralized marketplace (Exyon Market) for the WYDA community. 
              Built for speed, security, and lower fees on Binance Smart Chain.
            </p>
          </div>
          <div>
            <h4 className="text-bg font-bold uppercase text-xs tracking-widest mb-4">Resources</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="#" className="hover:text-primary">How it works</a></li>
              <li><a href="#" className="hover:text-primary">WYDA Token</a></li>
              <li><a href="#" className="hover:text-primary">BSCScan</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-bg font-bold uppercase text-xs tracking-widest mb-4">Support</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="#" className="hover:text-primary">Help Center</a></li>
              <li><a href="#" className="hover:text-primary">Terms of Service</a></li>
              <li><a href="#" className="hover:text-primary">Privacy Policy</a></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 pt-12 mt-12 border-t border-bg/5 flex flex-col md:flex-row items-center justify-between gap-4 text-xs">
          <p>© 2026 Exyon Market. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <span>Powered by Binance Smart Chain</span>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span>Network Status: Online</span>
            </div>
          </div>
        </div>
      </footer>

      {/* Item Detail Modal */}
      <AnimatePresence>
        {selectedListing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedListing(null)}
              className="absolute inset-0 bg-ink/80 backdrop-blur-sm"
            />
            <motion.div 
              layoutId={selectedListing.id}
              className="relative bg-bg w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row"
            >
              <div className="md:w-1/2 aspect-square md:aspect-auto">
                <img 
                  src={selectedListing.imageUrl} 
                  alt={selectedListing.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="md:w-1/2 p-8 md:p-12 flex flex-col">
                <button 
                  onClick={() => setSelectedListing(null)}
                  className="absolute top-6 right-6 w-10 h-10 bg-ink/5 rounded-full flex items-center justify-center hover:bg-ink/10 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
                
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4 text-primary" />
                      <span className="text-xs uppercase font-bold opacity-40 tracking-widest">{selectedListing.category} {selectedListing.isDigital ? '(Digital)' : '(Physical)'}</span>
                    </div>
                    {wallet.address === selectedListing.seller && (
                      <button 
                        onClick={() => {
                          setEditingListing(selectedListing);
                          setSelectedListing(null);
                          setIsSellModalOpen(true);
                        }}
                        className="flex items-center gap-1 text-[10px] font-bold uppercase text-primary hover:underline"
                      >
                        <Edit3 className="w-3 h-3" /> Edit Listing
                      </button>
                    )}
                  </div>
                  <h2 className="text-4xl font-bold mb-4 tracking-tight leading-none">{selectedListing.title}</h2>
                  <div className="flex items-center gap-4 mb-8">
                    <div className="bg-primary/10 text-primary px-4 py-2 rounded-xl font-mono font-bold text-xl">
                      {selectedListing.price} WYDA
                    </div>
                    <div className="text-xs font-mono opacity-50">
                      Seller: {profiles.find(p => p.address === selectedListing.seller)?.nickname || selectedListing.seller}
                    </div>
                  </div>
                  <p className="text-ink/70 text-lg leading-relaxed mb-8">
                    {selectedListing.description}
                  </p>

                  <div className="space-y-6">
                    <h3 className="text-xl font-bold uppercase tracking-tight flex items-center gap-2">
                      <MessageSquare className="w-5 h-5 text-primary" />
                      Comments
                    </h3>
                    
                    <div className="space-y-4 max-h-[200px] overflow-y-auto pr-2 scrollbar-thin">
                      {comments.length > 0 ? (
                        comments.map(comment => (
                          <div key={comment.id} className="p-4 bg-ink/5 rounded-2xl border border-line/5">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-[10px] font-mono font-bold text-primary">{comment.authorAddress.slice(0, 6)}...{comment.authorAddress.slice(-4)}</span>
                              <span className="text-[10px] opacity-40">{new Date(comment.timestamp).toLocaleString()}</span>
                            </div>
                            <p className="text-sm opacity-80">{comment.text}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm opacity-40 italic py-4">No comments yet. Be the first to comment!</p>
                      )}
                    </div>

                    {wallet.isConnected && (
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          id="commentInput"
                          placeholder="Add a comment..."
                          className="flex-1 bg-ink/5 border border-line/10 rounded-xl px-4 py-3 focus:outline-none focus:border-primary transition-colors text-sm"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const input = e.currentTarget;
                              handleAddComment(selectedListing.id, input.value);
                              input.value = '';
                            }
                          }}
                        />
                        <button 
                          onClick={() => {
                            const input = document.getElementById('commentInput') as HTMLInputElement;
                            handleAddComment(selectedListing.id, input.value);
                            input.value = '';
                          }}
                          className="w-12 h-12 bg-primary text-bg rounded-xl flex items-center justify-center hover:opacity-90 transition-opacity"
                        >
                          <Send className="w-5 h-5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-8 border-t border-line/10 space-y-4">
                  {selectedListing.allowBidding && (
                    <div className="flex gap-2">
                      <input 
                        type="number" 
                        placeholder="Bid amount..."
                        id="bidAmount"
                        className="flex-1 bg-ink/5 border border-line/10 rounded-xl px-4 py-3 focus:outline-none focus:border-primary transition-colors font-mono"
                      />
                      <button 
                        onClick={() => {
                          const input = document.getElementById('bidAmount') as HTMLInputElement;
                          handlePlaceBid(selectedListing, Number(input.value));
                        }}
                        disabled={isLoading}
                        className="px-6 py-3 bg-primary text-bg rounded-xl font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
                      >
                        Bid
                      </button>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleBuy(selectedListing)}
                      disabled={isLoading}
                      className="flex-1 py-4 bg-ink text-bg rounded-full font-bold text-lg hover:bg-primary transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isLoading ? <Clock className="w-5 h-5 animate-spin" /> : <ShoppingBag className="w-5 h-5" />}
                      Buy with WYDA
                    </button>
                    {selectedListing.allowCustomOrder && (
                      <button 
                        onClick={() => handleCustomOrder(selectedListing)}
                        disabled={isLoading}
                        className="px-6 py-4 border-2 border-ink text-ink rounded-full font-bold hover:bg-ink hover:text-bg transition-colors disabled:opacity-50"
                      >
                        Custom
                      </button>
                    )}
                  </div>
                  
                  {selectedListing.highestBid && (
                    <p className="text-center text-xs font-mono text-primary font-bold">
                      Current Highest Bid: {selectedListing.highestBid} WYDA by {selectedListing.highestBidder?.slice(0, 6)}...
                    </p>
                  )}

                  <p className="text-center text-[10px] uppercase font-bold opacity-30 mt-4 tracking-widest">
                    Transaction will be processed on BSC
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Sell Modal */}
      <AnimatePresence>
        {isSellModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsSellModalOpen(false);
                setEditingListing(null);
              }}
              className="absolute inset-0 bg-ink/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-bg w-full max-w-lg rounded-3xl p-8 shadow-2xl"
            >
              <button 
                onClick={() => {
                  setIsSellModalOpen(false);
                  setEditingListing(null);
                }}
                className="absolute top-6 right-6 w-10 h-10 bg-ink/5 rounded-full flex items-center justify-center hover:bg-ink/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <h2 className="text-3xl font-bold mb-6 tracking-tight">{editingListing ? 'Edit Item' : 'List New Item'}</h2>
              
              <form onSubmit={handleAddListing} className="space-y-6">
                <div>
                  <label className="block text-[10px] uppercase font-bold opacity-50 mb-2 tracking-widest">Item Title</label>
                  <input 
                    required
                    name="title"
                    type="text" 
                    defaultValue={editingListing?.title}
                    placeholder="e.g. Vintage Camera"
                    className="w-full bg-ink/5 border border-line/10 rounded-xl p-4 focus:outline-none focus:border-primary transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold opacity-50 mb-2 tracking-widest">Item Image</label>
                  <div className="flex gap-4 items-center">
                    <div className="w-20 h-20 bg-ink/5 rounded-xl border border-line/10 overflow-hidden flex items-center justify-center">
                      {uploadedImage || editingListing?.imageUrl ? (
                        <img src={uploadedImage || editingListing?.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                      ) : (
                        <Plus className="w-6 h-6 opacity-20" />
                      )}
                    </div>
                    <label className="flex-1 cursor-pointer">
                      <div className="w-full bg-ink/5 border border-line/10 rounded-xl p-4 text-center hover:bg-ink/10 transition-colors">
                        <span className="text-xs font-bold opacity-60">Upload from computer</span>
                      </div>
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold opacity-50 mb-2 tracking-widest">Description</label>
                  <textarea 
                    required
                    name="description"
                    defaultValue={editingListing?.description}
                    placeholder="Describe your item..."
                    rows={4}
                    className="w-full bg-ink/5 border border-line/10 rounded-xl p-4 focus:outline-none focus:border-primary transition-colors resize-none"
                  />
                </div>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-[10px] uppercase font-bold opacity-50 mb-2 tracking-widest">Category</label>
                    <select 
                      required
                      name="category"
                      defaultValue={editingListing?.category}
                      className="w-full bg-ink/5 border border-line/10 rounded-xl p-4 focus:outline-none focus:border-primary transition-colors appearance-none"
                    >
                      <option value="Living">Living</option>
                      <option value="Automotive">Automotive</option>
                      <option value="Electronics">Electronics</option>
                      <option value="Others">Others</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] uppercase font-bold opacity-50 mb-2 tracking-widest">Price (WYDA)</label>
                    <div className="relative">
                      <input 
                        required
                        name="price"
                        type="number" 
                        defaultValue={editingListing?.price}
                        placeholder="0.00"
                        className="w-full bg-ink/5 border border-line/10 rounded-xl p-4 pl-12 focus:outline-none focus:border-primary transition-colors font-mono"
                      />
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-primary">W</div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="flex items-center gap-2 cursor-pointer p-3 bg-ink/5 rounded-xl border border-line/10 hover:border-primary/50 transition-colors">
                      <input type="checkbox" name="isDigital" defaultChecked={editingListing?.isDigital} className="w-4 h-4 accent-primary" />
                      <span className="text-[10px] uppercase font-bold opacity-70 tracking-widest">Digital Goods</span>
                    </label>
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] uppercase font-bold opacity-50 mb-2 tracking-widest">Download URL</label>
                    <input 
                      name="downloadUrl"
                      type="url" 
                      defaultValue={editingListing?.downloadUrl}
                      placeholder="https://example.com/file.zip"
                      className="w-full bg-ink/5 border border-line/10 rounded-xl p-4 focus:outline-none focus:border-primary transition-colors"
                    />
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="flex items-center gap-2 cursor-pointer p-3 bg-ink/5 rounded-xl border border-line/10 hover:border-primary/50 transition-colors">
                      <input type="checkbox" name="allowBidding" defaultChecked={editingListing?.allowBidding} className="w-4 h-4 accent-primary" />
                      <span className="text-[10px] uppercase font-bold opacity-70 tracking-widest">Allow Bidding</span>
                    </label>
                  </div>
                  <div className="flex-1">
                    <label className="flex items-center gap-2 cursor-pointer p-3 bg-ink/5 rounded-xl border border-line/10 hover:border-primary/50 transition-colors">
                      <input type="checkbox" name="allowCustomOrder" defaultChecked={editingListing?.allowCustomOrder} className="w-4 h-4 accent-primary" />
                      <span className="text-[10px] uppercase font-bold opacity-70 tracking-widest">Custom Order</span>
                    </label>
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={!wallet.isConnected}
                  className="w-full py-4 bg-primary text-bg rounded-full font-bold text-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {wallet.isConnected ? (
                    <>
                      <Plus className="w-5 h-5" />
                      Create Listing
                    </>
                  ) : (
                    <>
                      <Wallet className="w-5 h-5" />
                      Connect Wallet to List
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Edit Profile Modal */}
      <AnimatePresence>
        {isEditProfileModalOpen && wallet.profile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditProfileModalOpen(false)}
              className="absolute inset-0 bg-ink/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-bg w-full max-w-md rounded-3xl p-8 shadow-2xl"
            >
              <button 
                onClick={() => setIsEditProfileModalOpen(false)}
                className="absolute top-6 right-6 w-10 h-10 bg-ink/5 rounded-full flex items-center justify-center hover:bg-ink/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <h2 className="text-3xl font-bold mb-6 tracking-tight">Edit Profile</h2>
              
              <form onSubmit={handleUpdateProfileDetails} className="space-y-6">
                <div>
                  <label className="block text-[10px] uppercase font-bold opacity-50 mb-2 tracking-widest">Nickname</label>
                  <input 
                    name="nickname"
                    type="text" 
                    defaultValue={wallet.profile.nickname}
                    placeholder="Enter your nickname"
                    className="w-full bg-ink/5 border border-line/10 rounded-xl p-4 focus:outline-none focus:border-primary transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold opacity-50 mb-2 tracking-widest">Avatar URL</label>
                  <input 
                    name="avatarUrl"
                    type="url" 
                    defaultValue={wallet.profile.avatarUrl}
                    placeholder="https://example.com/avatar.png"
                    className="w-full bg-ink/5 border border-line/10 rounded-xl p-4 focus:outline-none focus:border-primary transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold opacity-50 mb-2 tracking-widest">Wallet Address</label>
                  <div className="w-full bg-ink/5 border border-line/10 rounded-xl p-4 font-mono text-sm opacity-50">
                    {wallet.address}
                  </div>
                </div>

                <button 
                  type="submit"
                  className="w-full py-4 bg-ink text-bg rounded-full font-bold hover:bg-primary transition-colors"
                >
                  Save Changes
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
