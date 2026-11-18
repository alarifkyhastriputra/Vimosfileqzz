import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  User,
  Post,
  Announcement,
  SellerApplication,
  UserShop,
  ShopItem,
  ShopOrder
} from '../types.ts';
import { ref, onValue, update, set, push, remove, get } from 'firebase/database';
import { db } from '../firebase.ts';

interface AdminPanelProps {
  currentUser?: User | null;
  users: User[];
  posts?: Post[];
  announcements: Announcement[];
  onAddAnnouncement: (text: string) => void;
  onUpdateAnnouncement: (id: string, text: string) => void;
  onDeleteAnnouncement: (id: string) => void;
  onSetRole: (userId: string, role: string, color?: string) => void;
  onBanUser: (userId: string) => void;
  onTakeDownPost?: (postId: string) => void;
  onDeletePost?: (postId: string) => void;
  onUserClick: (uid: string) => void;
  onToggleAdmin?: (userId: string, currentStatus: boolean) => Promise<{ success: boolean; message?: string } | void> | void;
}

type AdminTab = 'overview' | 'kyc' | 'marketplace' | 'content' | 'users' | 'broadcast';

interface ConfirmModalState {
  title: string;
  message: string;
  confirmLabel: string;
  variant: 'danger' | 'warning';
  onConfirm: () => Promise<void> | void;
}

const MASTER_ADMIN_EMAILS = [
  'nwaystore68@gmail.com',
  'nwaystore78@gmail.com',
  'nocteos609@gmail.com',
  'hasbullahbeloh27@gmail.com'
];

const PRESET_COLORS = [
  '#000000', '#EF4444', '#10B981', '#3B82F6', '#F59E0B', '#8B5CF6', '#EC4899', '#6B7280', '#06B6D4', '#111827'
];

const ROLE_PRESETS = [
  { label: 'Verified Merchant', color: '#F59E0B' },
  { label: 'Moderator', color: '#3B82F6' },
  { label: 'VIP', color: '#8B5CF6' },
  { label: 'Creator', color: '#EC4899' },
  { label: 'Curator', color: '#10B981' },
  { label: 'Co-Admin', color: '#000000' }
];

export const AdminPanel: React.FC<AdminPanelProps> = ({
  currentUser,
  users,
  posts = [],
  announcements,
  onAddAnnouncement,
  onUpdateAnnouncement,
  onDeleteAnnouncement,
  onSetRole,
  onBanUser,
  onTakeDownPost,
  onDeletePost,
  onUserClick,
  onToggleAdmin
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');

  // Users tab filters & role modal
  const [adminSearch, setAdminSearch] = useState('');
  const [userFilter, setUserFilter] = useState<'all' | 'online' | 'admin' | 'merchant' | 'banned'>('all');
  const [editingRoleUser, setEditingRoleUser] = useState<User | null>(null);
  const [newRoleValue, setNewRoleValue] = useState('');
  const [newRoleColor, setNewRoleColor] = useState('#000000');

  // Broadcast & Mass notification states
  const [broadcastText, setBroadcastText] = useState('');
  const [editingAnnId, setEditingAnnId] = useState<string | null>(null);
  const [massNotifText, setMassNotifText] = useState('');
  const [isSendingMassNotif, setIsSendingMassNotif] = useState(false);

  // KYC Seller Applications state from Firebase RTDB
  const [sellerApplications, setSellerApplications] = useState<SellerApplication[]>([]);
  const [kycFilter, setKycFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [kycSearch, setKycSearch] = useState('');
  const [rejectingApp, setRejectingApp] = useState<SellerApplication | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');
  const [fullscreenDoc, setFullscreenDoc] = useState<{ url: string; title: string; applicantName: string } | null>(null);

  // Marketplace moderation states (Shops, Items, Orders)
  const [shops, setShops] = useState<UserShop[]>([]);
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [shopOrders, setShopOrders] = useState<ShopOrder[]>([]);
  const [marketSubTab, setMarketSubTab] = useState<'shops' | 'items' | 'orders'>('shops');
  const [marketSearch, setMarketSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | 'pending' | 'processing' | 'completed' | 'cancelled'>('all');

  // Content moderation states
  const [contentSearch, setContentSearch] = useState('');
  const [contentFilter, setContentFilter] = useState<'all' | 'active' | 'takendown' | 'video' | 'photo'>('all');

  // Reusable In-App Confirm Modal (never use window.confirm)
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState | null>(null);
  const [isConfirmRunning, setIsConfirmRunning] = useState(false);

  // Toast banner with clean timer ref
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToastMsg({ text, type });
    toastTimerRef.current = window.setTimeout(() => {
      setToastMsg(null);
      toastTimerRef.current = null;
    }, 3600);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // Subscribe to sellerApplications, shops, shopItems, shopOrders in Firebase RTDB
  useEffect(() => {
    const appsRef = ref(db, 'sellerApplications');
    const shopsRef = ref(db, 'shops');
    const itemsRef = ref(db, 'shopItems');
    const ordersRef = ref(db, 'shopOrders');

    const mapApps = (data: Record<string, any> | null): SellerApplication[] => {
      if (!data) return [];
      return Object.entries(data)
        .map(([id, val]) => ({ id, ...val }))
        .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
    };

    const mapShops = (data: Record<string, any> | null): UserShop[] => {
      if (!data) return [];
      return Object.entries(data)
        .map(([id, val]) => ({ id, ...val }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    };

    const mapItems = (data: Record<string, any> | null): ShopItem[] => {
      if (!data) return [];
      return Object.entries(data)
        .map(([id, val]) => ({ id, ...val }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    };

    const mapOrders = (data: Record<string, any> | null): ShopOrder[] => {
      if (!data) return [];
      return Object.entries(data)
        .map(([id, val]) => ({ id, ...val }))
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    };

    get(appsRef).then((snap) => setSellerApplications(mapApps(snap.val()))).catch(() => {});

    const unsubApps = onValue(appsRef, (snap) => setSellerApplications(mapApps(snap.val())));
    const unsubShops = onValue(shopsRef, (snap) => setShops(mapShops(snap.val())));
    const unsubItems = onValue(itemsRef, (snap) => setShopItems(mapItems(snap.val())));
    const unsubOrders = onValue(ordersRef, (snap) => setShopOrders(mapOrders(snap.val())));

    return () => {
      unsubApps();
      unsubShops();
      unsubItems();
      unsubOrders();
    };
  }, []);

  const isProtectedMasterAdmin = (u: User) => {
    const email = (u.email || '').toLowerCase();
    return MASTER_ADMIN_EMAILS.includes(email);
  };

  const pendingCount = useMemo(
    () => sellerApplications.filter((a) => a.status === 'pending').length,
    [sellerApplications]
  );

  // Realtime Overview KPIs
  const overviewStats = useMemo(() => {
    const onlineUsers = users.filter((u) => u.isOnline).length;
    const bannedUsers = users.filter((u) => u.isBanned).length;
    const adminUsers = users.filter((u) => u.isAdmin).length;
    const takenDownPosts = posts.filter((p) => p.isTakenDown).length;
    const completedOrders = shopOrders.filter((o) => o.status === 'completed');
    const pendingOrders = shopOrders.filter((o) => o.status === 'pending' || o.status === 'processing');
    const totalRevenue = completedOrders.reduce((sum, o) => sum + (o.totalPrice || 0), 0);

    return {
      onlineUsers,
      bannedUsers,
      adminUsers,
      takenDownPosts,
      completedOrdersCount: completedOrders.length,
      pendingOrdersCount: pendingOrders.length,
      totalRevenue
    };
  }, [users, posts, shopOrders]);

  const filteredUsers = useMemo(() => {
    const safeSearch = (adminSearch || '').toLowerCase().trim();
    return users.filter((u) => {
      if (userFilter === 'online' && !u.isOnline) return false;
      if (userFilter === 'admin' && !u.isAdmin) return false;
      if (userFilter === 'merchant' && !u.isVerifiedSeller) return false;
      if (userFilter === 'banned' && !u.isBanned) return false;

      if (!safeSearch) return true;
      return (
        (u.name || '').toLowerCase().includes(safeSearch) ||
        (u.email || '').toLowerCase().includes(safeSearch) ||
        (u.role || '').toLowerCase().includes(safeSearch)
      );
    });
  }, [users, adminSearch, userFilter]);

  const filteredKycApps = useMemo(() => {
    return sellerApplications.filter((app) => {
      if (kycFilter !== 'all' && app.status !== kycFilter) return false;
      if (!kycSearch.trim()) return true;
      const q = kycSearch.toLowerCase();
      return (
        (app.fullName || '').toLowerCase().includes(q) ||
        (app.userName || '').toLowerCase().includes(q) ||
        (app.userEmail || '').toLowerCase().includes(q) ||
        (app.phoneWhatsapp || '').toLowerCase().includes(q) ||
        (app.shopName || '').toLowerCase().includes(q) ||
        (app.city || '').toLowerCase().includes(q) ||
        (app.province || '').toLowerCase().includes(q)
      );
    });
  }, [sellerApplications, kycFilter, kycSearch]);

  const filteredShops = useMemo(() => {
    const q = marketSearch.toLowerCase().trim();
    if (!q) return shops;
    return shops.filter(
      (s) =>
        (s.shopName || '').toLowerCase().includes(q) ||
        (s.ownerName || '').toLowerCase().includes(q) ||
        (s.location || '').toLowerCase().includes(q)
    );
  }, [shops, marketSearch]);

  const filteredMarketItems = useMemo(() => {
    const q = marketSearch.toLowerCase().trim();
    if (!q) return shopItems;
    return shopItems.filter(
      (item) =>
        (item.name || '').toLowerCase().includes(q) ||
        (item.ownerName || '').toLowerCase().includes(q) ||
        (item.category || '').toLowerCase().includes(q)
    );
  }, [shopItems, marketSearch]);

  const filteredMarketOrders = useMemo(() => {
    const q = marketSearch.toLowerCase().trim();
    return shopOrders.filter((order) => {
      if (orderStatusFilter !== 'all' && order.status !== orderStatusFilter) return false;
      if (!q) return true;
      return (
        (order.itemName || '').toLowerCase().includes(q) ||
        (order.shopName || '').toLowerCase().includes(q) ||
        (order.buyerName || '').toLowerCase().includes(q) ||
        (order.id || '').toLowerCase().includes(q)
      );
    });
  }, [shopOrders, marketSearch, orderStatusFilter]);

  const filteredPosts = useMemo(() => {
    const q = contentSearch.toLowerCase().trim();
    return posts
      .filter((post) => {
        if (contentFilter === 'active' && post.isTakenDown) return false;
        if (contentFilter === 'takendown' && !post.isTakenDown) return false;
        if (contentFilter === 'video' && !post.videoURL) return false;
        if (contentFilter === 'photo' && !post.photoURL) return false;
        if (!q) return true;
        return (
          (post.userName || '').toLowerCase().includes(q) ||
          (post.text || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }, [posts, contentSearch, contentFilter]);

  const reviewerLabel = currentUser?.name || 'Admin';

  // Approve seller application (preserves existing shop logo/managers on re-approval)
  const handleApproveSeller = async (app: SellerApplication) => {
    try {
      const now = Date.now();
      await update(ref(db, `sellerApplications/${app.userId}`), {
        status: 'approved',
        reviewedAt: now,
        reviewedBy: reviewerLabel
      });

      await update(ref(db, `users/${app.userId}`), {
        isVerifiedSeller: true,
        sellerStatus: 'approved',
        role: 'Verified Merchant',
        roleColor: '#F59E0B'
      });

      const shopId = `shop_${app.userId}`;
      const existingSnap = await get(ref(db, `shops/${shopId}`));
      const existingShop = existingSnap.exists() ? (existingSnap.val() as UserShop) : null;

      const shopPayload: UserShop = {
        id: shopId,
        ownerId: app.userId,
        ownerName: app.userName || app.fullName,
        ownerPhoto: app.userPhoto || existingShop?.ownerPhoto || '',
        shopName: existingShop?.shopName || app.shopName,
        description: existingShop?.description || app.shopDescription || 'Toko Resmi Terverifikasi di Vimos',
        logoURL: existingShop?.logoURL || app.userPhoto || '',
        bannerURL:
          existingShop?.bannerURL ||
          app.shopBannerURL ||
          'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200&auto=format&fit=crop&q=80',
        phoneWhatsapp: existingShop?.phoneWhatsapp || app.phoneWhatsapp,
        location: existingShop?.location || `${app.city || ''}, ${app.province || ''}`.trim(),
        city: existingShop?.city || app.city || '',
        province: existingShop?.province || app.province || '',
        isVerified: true,
        ...(existingShop?.managers ? { managers: existingShop.managers } : {}),
        createdAt: existingShop?.createdAt || now
      };
      await update(ref(db, `shops/${shopId}`), shopPayload);

      const notifRef = push(ref(db, `notifications/${app.userId}`));
      await set(notifRef, {
        id: notifRef.key,
        senderId: 'admin_system',
        senderName: 'Tim Admin Vimos',
        senderPhoto: 'https://api.dicebear.com/7.x/bottts/svg?seed=vimos_admin',
        type: 'comment',
        commentText: `Selamat! Pengajuan Akun Toko "${app.shopName}" Anda telah DISETUJUI oleh Admin. Anda sekarang dapat mulai berjualan!`,
        timestamp: now,
        read: false
      });

      showToast(`Pengajuan toko "${app.shopName}" (${app.fullName}) berhasil disetujui.`, 'success');
    } catch (err) {
      console.error('Error approving seller:', err);
      showToast('Gagal menyetujui pengajuan toko.', 'error');
    }
  };

  // Reject seller application
  const handleRejectSeller = async () => {
    if (!rejectingApp) return;
    const app = rejectingApp;
    const reason = rejectionReasonInput.trim() || 'Foto dokumen/pemilik kurang jelas atau data tidak sesuai.';

    try {
      const now = Date.now();
      await update(ref(db, `sellerApplications/${app.userId}`), {
        status: 'rejected',
        rejectionReason: reason,
        reviewedAt: now,
        reviewedBy: reviewerLabel
      });

      await update(ref(db, `users/${app.userId}`), {
        isVerifiedSeller: false,
        sellerStatus: 'rejected'
      });

      const notifRef = push(ref(db, `notifications/${app.userId}`));
      await set(notifRef, {
        id: notifRef.key,
        senderId: 'admin_system',
        senderName: 'Tim Admin Vimos',
        senderPhoto: 'https://api.dicebear.com/7.x/bottts/svg?seed=vimos_admin',
        type: 'comment',
        commentText: `Pengajuan Akun Toko "${app.shopName}" belum dapat disetujui. Alasan: ${reason}. Silakan perbaiki data dan ajukan ulang.`,
        timestamp: now,
        read: false
      });

      showToast(`Pengajuan toko ${app.fullName} ditolak dengan catatan.`, 'success');
      setRejectingApp(null);
      setRejectionReasonInput('');
    } catch (err) {
      console.error('Error rejecting seller:', err);
      showToast('Gagal menolak pengajuan toko.', 'error');
    }
  };

  // Shared helper to delete a shop, all its products, and reset owner merchant status cleanly
  const deleteShopAndRevoke = async (ownerId: string, shopName: string, targetShopId?: string) => {
    try {
      await remove(ref(db, `sellerApplications/${ownerId}`));

      const deletePromises: Promise<void>[] = [];
      const fallbackShopId = targetShopId || `shop_${ownerId}`;

      const shopSnap = await get(ref(db, 'shops'));
      if (shopSnap.exists()) {
        const shopsVal = shopSnap.val();
        Object.entries(shopsVal).forEach(([shopId, shopData]: [string, any]) => {
          if (shopData?.ownerId === ownerId || shopId === fallbackShopId) {
            deletePromises.push(remove(ref(db, `shops/${shopId}`)));
          }
        });
      }

      const itemsSnap = await get(ref(db, 'shopItems'));
      if (itemsSnap.exists()) {
        const itemsVal = itemsSnap.val();
        Object.entries(itemsVal).forEach(([itemId, itemData]: [string, any]) => {
          if (itemData?.ownerId === ownerId || itemData?.shopId === fallbackShopId) {
            deletePromises.push(remove(ref(db, `shopItems/${itemId}`)));
          }
        });
      }

      await Promise.all(deletePromises);

      await update(ref(db, `users/${ownerId}`), {
        isVerifiedSeller: false,
        sellerStatus: 'unregistered',
        sellerApplicationId: null
      });

      const notifRef = push(ref(db, `notifications/${ownerId}`));
      await set(notifRef, {
        id: notifRef.key,
        senderId: 'admin_system',
        senderName: 'Tim Admin Vimos',
        senderPhoto: 'https://api.dicebear.com/7.x/bottts/svg?seed=vimos_admin',
        type: 'comment',
        commentText: `Toko "${shopName}" beserta seluruh produknya telah dihapus oleh Admin. Status pedagang Anda telah dicabut.`,
        timestamp: Date.now(),
        read: false
      });

      showToast(`Toko "${shopName}" dan seluruh produknya berhasil dihapus.`, 'success');
    } catch (err) {
      console.error('Error deleting shop by admin:', err);
      showToast('Gagal menghapus toko.', 'error');
    }
  };

  const requestDeleteShopFromKyc = (app: SellerApplication) => {
    setConfirmModal({
      title: 'Hapus Toko & Cabut Status Penjual',
      message: `Hapus toko "${app.shopName}" milik ${app.fullName} beserta seluruh produknya secara permanen? Tindakan ini tidak dapat dibatalkan.`,
      confirmLabel: 'Hapus Permanen',
      variant: 'danger',
      onConfirm: () => deleteShopAndRevoke(app.userId, app.shopName)
    });
  };

  const requestDeleteShopFromMarketplace = (shop: UserShop) => {
    setConfirmModal({
      title: 'Hapus Toko di Marketplace',
      message: `Hapus toko "${shop.shopName}" (${shop.ownerName}) beserta seluruh produk di etalasenya?`,
      confirmLabel: 'Hapus Toko',
      variant: 'danger',
      onConfirm: () => deleteShopAndRevoke(shop.ownerId, shop.shopName, shop.id)
    });
  };

  const handleToggleVerifyShop = async (shop: UserShop) => {
    try {
      const nextVerified = !shop.isVerified;
      await update(ref(db, `shops/${shop.id}`), { isVerified: nextVerified });
      showToast(
        nextVerified
          ? `Lencana terverifikasi diaktifkan untuk "${shop.shopName}".`
          : `Lencana terverifikasi dicabut dari "${shop.shopName}".`,
        'success'
      );
    } catch (err) {
      console.error('Failed to toggle shop verification:', err);
      showToast('Gagal memperbarui status verifikasi toko.', 'error');
    }
  };

  const requestDeleteMarketItem = (item: ShopItem) => {
    setConfirmModal({
      title: 'Hapus Produk Marketplace',
      message: `Hapus produk "${item.name}" dari etalase ${item.ownerName}?`,
      confirmLabel: 'Hapus Produk',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await remove(ref(db, `shopItems/${item.id}`));
          showToast(`Produk "${item.name}" berhasil dihapus.`, 'success');
        } catch (err) {
          console.error('Failed to delete shop item:', err);
          showToast('Gagal menghapus produk.', 'error');
        }
      }
    });
  };

  const handleUpdateOrderByAdmin = async (
    order: ShopOrder,
    newStatus: 'pending' | 'processing' | 'completed' | 'cancelled'
  ) => {
    try {
      await update(ref(db, `shopOrders/${order.id}`), {
        status: newStatus,
        processedById: currentUser?.id || 'admin_system',
        processedByName: `${reviewerLabel} (Admin)`
      });

      if (newStatus === 'cancelled' && order.status !== 'cancelled') {
        const itemRef = ref(db, `shopItems/${order.itemId}`);
        const itemSnap = await get(itemRef);
        if (itemSnap.exists()) {
          const currentStock = Number(itemSnap.val().stock || 0);
          await update(itemRef, { stock: currentStock + (order.quantity || 1) });
        }
      }

      showToast(`Status pesanan #${order.id.slice(-6)} diubah menjadi ${newStatus}.`, 'success');
    } catch (err) {
      console.error('Admin failed to update order status:', err);
      showToast('Gagal memperbarui status pesanan.', 'error');
    }
  };

  const handleBroadcastSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastText.trim()) return;
    if (editingAnnId) {
      onUpdateAnnouncement(editingAnnId, broadcastText.trim());
      setEditingAnnId(null);
      showToast('Pengumuman berhasil diperbarui.', 'success');
    } else {
      onAddAnnouncement(broadcastText.trim());
      showToast('Pengumuman baru berhasil dipublikasikan.', 'success');
    }
    setBroadcastText('');
  };

  const handleSendMassNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    const message = massNotifText.trim();
    if (!message) return;

    const targetUsers = users.filter((u) => !u.isBanned && u.id !== currentUser?.id);
    if (targetUsers.length === 0) {
      showToast('Tidak ada pengguna aktif untuk dikirimi notifikasi.', 'error');
      return;
    }

    setIsSendingMassNotif(true);
    try {
      const now = Date.now();
      await Promise.all(
        targetUsers.map((u) => {
          const notifRef = push(ref(db, `notifications/${u.id}`));
          return set(notifRef, {
            id: notifRef.key,
            senderId: currentUser?.id || 'admin_system',
            senderName: `${reviewerLabel} (Admin)`,
            senderPhoto: currentUser?.photoURL || 'https://api.dicebear.com/7.x/bottts/svg?seed=vimos_admin',
            type: 'comment',
            commentText: message,
            timestamp: now,
            read: false
          });
        })
      );
      setMassNotifText('');
      showToast(`Notifikasi massal terkirim ke ${targetUsers.length} pengguna aktif.`, 'success');
    } catch (err) {
      console.error('Mass notification failed:', err);
      showToast('Gagal mengirim notifikasi massal.', 'error');
    } finally {
      setIsSendingMassNotif(false);
    }
  };

  const startEditAnn = (ann: Announcement) => {
    setEditingAnnId(ann.id);
    setBroadcastText(ann.text);
  };

  const executeConfirmModal = async () => {
    if (!confirmModal) return;
    setIsConfirmRunning(true);
    try {
      await confirmModal.onConfirm();
      setConfirmModal(null);
    } finally {
      setIsConfirmRunning(false);
    }
  };

  const formatIDR = (val: number) => `Rp ${(val || 0).toLocaleString('id-ID')}`;

  return (
    <div className="p-4 sm:p-6 pb-28 animate-fade-in relative max-w-5xl mx-auto text-neutral-900">
      {/* Toast Alert */}
      {toastMsg && (
        <div
          className={`fixed top-16 left-1/2 -translate-x-1/2 z-[170] px-5 py-3 rounded-2xl shadow-2xl border flex items-center space-x-2 text-xs font-black transition-all animate-scale-up backdrop-blur-md ${
            toastMsg.type === 'success'
              ? 'bg-neutral-950 text-white border-amber-400'
              : 'bg-red-600 text-white border-red-700'
          }`}
        >
          <i className={`fas ${toastMsg.type === 'success' ? 'fa-circle-check text-amber-400' : 'fa-circle-exclamation'}`}></i>
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* HEADER COMMAND CENTER */}
      <div className="mb-6 bg-gradient-to-br from-neutral-950 via-zinc-900 to-black text-white p-5 sm:p-6 rounded-3xl shadow-xl border border-white/10 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center space-x-2">
              <span className="bg-amber-400 text-black text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full tracking-wider">
                Super Admin
              </span>
              <span className="text-[10px] text-neutral-300 font-bold">
                Masuk sebagai {reviewerLabel}
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight mt-1">Command Center</h2>
            <p className="text-xs text-neutral-400">
              Pusat kendali ekosistem: ringkasan data, verifikasi toko, moderasi marketplace & konten, pengguna, dan pengumuman.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 tabular-nums">
            <div className="bg-white/10 px-3 py-1.5 rounded-xl text-center border border-white/10">
              <p className="text-xs font-black text-amber-400">{pendingCount}</p>
              <p className="text-[8px] font-bold text-neutral-400 uppercase">KYC Pending</p>
            </div>
            <div className="bg-white/10 px-3 py-1.5 rounded-xl text-center border border-white/10">
              <p className="text-xs font-black text-emerald-400">{overviewStats.onlineUsers}</p>
              <p className="text-[8px] font-bold text-neutral-400 uppercase">Online</p>
            </div>
            <div className="bg-white/10 px-3 py-1.5 rounded-xl text-center border border-white/10">
              <p className="text-xs font-black text-white">{users.length}</p>
              <p className="text-[8px] font-bold text-neutral-400 uppercase">Total User</p>
            </div>
          </div>
        </div>

        {/* NAVIGATION TABS */}
        <div className="flex space-x-4 mt-6 border-b border-white/15 overflow-x-auto scrollbar-none text-xs font-bold">
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-2.5 transition-all flex items-center space-x-1.5 relative cursor-pointer shrink-0 ${
              activeTab === 'overview' ? 'text-amber-400 font-black' : 'text-neutral-400 hover:text-white'
            }`}
          >
            <i className="fas fa-chart-line"></i>
            <span>Ringkasan</span>
            {activeTab === 'overview' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-400 rounded-full"></div>}
          </button>

          <button
            onClick={() => setActiveTab('kyc')}
            className={`pb-2.5 transition-all flex items-center space-x-1.5 relative cursor-pointer shrink-0 ${
              activeTab === 'kyc' ? 'text-amber-400 font-black' : 'text-neutral-400 hover:text-white'
            }`}
          >
            <i className="fas fa-id-card"></i>
            <span>Verifikasi KYC</span>
            {pendingCount > 0 && (
              <span className="bg-amber-400 text-black text-[9px] font-black px-1.5 py-0.2 rounded-full tabular-nums">
                {pendingCount}
              </span>
            )}
            {activeTab === 'kyc' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-400 rounded-full"></div>}
          </button>

          <button
            onClick={() => setActiveTab('marketplace')}
            className={`pb-2.5 transition-all flex items-center space-x-1.5 relative cursor-pointer shrink-0 ${
              activeTab === 'marketplace' ? 'text-amber-400 font-black' : 'text-neutral-400 hover:text-white'
            }`}
          >
            <i className="fas fa-store"></i>
            <span>Marketplace ({shops.length})</span>
            {activeTab === 'marketplace' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-400 rounded-full"></div>}
          </button>

          <button
            onClick={() => setActiveTab('content')}
            className={`pb-2.5 transition-all flex items-center space-x-1.5 relative cursor-pointer shrink-0 ${
              activeTab === 'content' ? 'text-amber-400 font-black' : 'text-neutral-400 hover:text-white'
            }`}
          >
            <i className="fas fa-shield-halved"></i>
            <span>Moderasi Konten ({posts.length})</span>
            {activeTab === 'content' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-400 rounded-full"></div>}
          </button>

          <button
            onClick={() => setActiveTab('users')}
            className={`pb-2.5 transition-all flex items-center space-x-1.5 relative cursor-pointer shrink-0 ${
              activeTab === 'users' ? 'text-amber-400 font-black' : 'text-neutral-400 hover:text-white'
            }`}
          >
            <i className="fas fa-users-gear"></i>
            <span>Pengguna & Role</span>
            {activeTab === 'users' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-400 rounded-full"></div>}
          </button>

          <button
            onClick={() => setActiveTab('broadcast')}
            className={`pb-2.5 transition-all flex items-center space-x-1.5 relative cursor-pointer shrink-0 ${
              activeTab === 'broadcast' ? 'text-amber-400 font-black' : 'text-neutral-400 hover:text-white'
            }`}
          >
            <i className="fas fa-bullhorn"></i>
            <span>Broadcast</span>
            {activeTab === 'broadcast' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-400 rounded-full"></div>}
          </button>
        </div>
      </div>

      {/* ============================================================= */}
      {/* TAB 0: OVERVIEW / DASHBOARD STATISTIK REALTIME */}
      {/* ============================================================= */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* 4 KPI CARDS */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 tabular-nums">
            <div className="bg-white border border-neutral-200 rounded-2xl p-4 shadow-xs space-y-1">
              <div className="flex items-center justify-between text-neutral-400">
                <span className="text-[10px] font-black uppercase tracking-wider">Pengguna</span>
                <i className="fas fa-users text-xs text-neutral-500"></i>
              </div>
              <p className="text-2xl font-black text-neutral-900">{users.length}</p>
              <p className="text-[11px] font-bold text-neutral-500">
                <span className="text-emerald-600">{overviewStats.onlineUsers} online</span> ·{' '}
                <span className="text-red-600">{overviewStats.bannedUsers} diblokir</span>
              </p>
            </div>

            <div className="bg-white border border-neutral-200 rounded-2xl p-4 shadow-xs space-y-1">
              <div className="flex items-center justify-between text-neutral-400">
                <span className="text-[10px] font-black uppercase tracking-wider">Postingan</span>
                <i className="fas fa-photo-film text-xs text-neutral-500"></i>
              </div>
              <p className="text-2xl font-black text-neutral-900">{posts.length}</p>
              <p className="text-[11px] font-bold text-neutral-500">
                <span className="text-amber-600">{overviewStats.takenDownPosts} ditakedown</span> ·{' '}
                <span>{overviewStats.adminUsers} admin</span>
              </p>
            </div>

            <div className="bg-white border border-neutral-200 rounded-2xl p-4 shadow-xs space-y-1">
              <div className="flex items-center justify-between text-neutral-400">
                <span className="text-[10px] font-black uppercase tracking-wider">Toko & Produk</span>
                <i className="fas fa-store text-xs text-neutral-500"></i>
              </div>
              <p className="text-2xl font-black text-neutral-900">{shops.length}</p>
              <p className="text-[11px] font-bold text-neutral-500">
                <span>{shopItems.length} produk terdaftar</span>
              </p>
            </div>

            <div className="bg-neutral-950 text-white border border-neutral-800 rounded-2xl p-4 shadow-xs space-y-1">
              <div className="flex items-center justify-between text-neutral-400">
                <span className="text-[10px] font-black uppercase tracking-wider">Omzet Pasar Selesai</span>
                <i className="fas fa-wallet text-xs text-amber-400"></i>
              </div>
              <p className="text-xl sm:text-2xl font-black text-amber-400 truncate">
                {formatIDR(overviewStats.totalRevenue)}
              </p>
              <p className="text-[11px] font-bold text-neutral-400">
                {overviewStats.completedOrdersCount} selesai · {overviewStats.pendingOrdersCount} aktif
              </p>
            </div>
          </div>

          {/* PENDING KYC CALLOUT */}
          {pendingCount > 0 && (
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-amber-400 text-black flex items-center justify-center shrink-0">
                  <i className="fas fa-id-card"></i>
                </div>
                <div>
                  <h3 className="text-sm font-black text-neutral-900">
                    Ada {pendingCount} pengajuan toko menunggu tinjauan Admin
                  </h3>
                  <p className="text-xs text-neutral-600">
                    Periksa data pemilik dan informasi toko sebelum memberikan status Merchant.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setKycFilter('pending');
                  setActiveTab('kyc');
                }}
                className="px-4 py-2 bg-black text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer shrink-0"
              >
                Tinjau KYC Sekarang
              </button>
            </div>
          )}

          {/* TWO-COLUMN LATEST MARKET ORDERS & NEWEST USERS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Latest Marketplace Transactions */}
            <div className="bg-white border border-neutral-200 rounded-2xl p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-neutral-100 pb-2.5">
                <h3 className="text-xs font-black uppercase tracking-wider text-neutral-900">
                  Transaksi Pasar Terbaru
                </h3>
                <button
                  onClick={() => {
                    setMarketSubTab('orders');
                    setActiveTab('marketplace');
                  }}
                  className="text-[11px] font-bold text-neutral-600 hover:text-black cursor-pointer"
                >
                  Lihat Semua →
                </button>
              </div>
              {shopOrders.length === 0 ? (
                <p className="text-xs text-neutral-400 py-6 text-center">Belum ada transaksi marketplace.</p>
              ) : (
                <div className="space-y-2">
                  {shopOrders.slice(0, 5).map((order) => (
                    <div
                      key={order.id}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-neutral-50 border border-neutral-200/80 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-neutral-900 truncate">
                          {order.itemName} <span className="text-neutral-500">x{order.quantity}</span>
                        </p>
                        <p className="text-[11px] text-neutral-500 truncate">
                          {order.buyerName} → {order.shopName}
                        </p>
                      </div>
                      <div className="text-right shrink-0 tabular-nums">
                        <p className="font-black text-neutral-900">{formatIDR(order.totalPrice)}</p>
                        <span
                          className={`inline-block text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                            order.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : order.status === 'cancelled'
                              ? 'bg-red-100 text-red-700'
                              : order.status === 'processing'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {order.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Newest / Active Users */}
            <div className="bg-white border border-neutral-200 rounded-2xl p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-neutral-100 pb-2.5">
                <h3 className="text-xs font-black uppercase tracking-wider text-neutral-900">
                  Pengguna Terbaru
                </h3>
                <button
                  onClick={() => setActiveTab('users')}
                  className="text-[11px] font-bold text-neutral-600 hover:text-black cursor-pointer"
                >
                  Kelola User →
                </button>
              </div>
              <div className="space-y-2">
                {[...users]
                  .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
                  .slice(0, 5)
                  .map((u) => (
                    <div
                      key={u.id}
                      onClick={() => onUserClick(u.id)}
                      className="flex items-center justify-between gap-2 p-2 rounded-xl bg-neutral-50 hover:bg-neutral-100 border border-neutral-200/80 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <img
                          src={u.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(u.name || 'U')}`}
                          alt={u.name}
                          className="w-8 h-8 rounded-full object-cover border border-neutral-300 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-neutral-900 truncate">{u.name}</p>
                          <p className="text-[10px] text-neutral-500 truncate">{u.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {u.isAdmin && (
                          <span className="text-[9px] font-black uppercase bg-amber-400 text-black px-2 py-0.5 rounded-md">
                            Admin
                          </span>
                        )}
                        {u.isVerifiedSeller && (
                          <span className="text-[9px] font-black uppercase bg-neutral-900 text-white px-2 py-0.5 rounded-md">
                            Toko
                          </span>
                        )}
                        {u.isOnline && (
                          <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                            Online
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* TAB 1: KYC SELLER VERIFICATION / VERIFIKASI AKUN TOKO */}
      {/* ============================================================= */}
      {activeTab === 'kyc' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <i className="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 text-xs"></i>
              <input
                type="text"
                value={kycSearch}
                onChange={(e) => setKycSearch(e.target.value)}
                placeholder="Cari nama pemilik, WhatsApp, nama toko, kota, provinsi..."
                className="w-full bg-white border border-neutral-300 rounded-2xl pl-9 pr-8 py-2.5 text-xs font-bold focus:outline-none focus:border-black shadow-xs"
              />
              {kycSearch && (
                <button
                  onClick={() => setKycSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-black text-xs cursor-pointer"
                >
                  <i className="fas fa-xmark"></i>
                </button>
              )}
            </div>

            <div className="flex items-center space-x-1.5 bg-white p-1 rounded-2xl border border-neutral-200 shrink-0 overflow-x-auto tabular-nums">
              <button
                onClick={() => setKycFilter('pending')}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all cursor-pointer ${
                  kycFilter === 'pending' ? 'bg-amber-400 text-black shadow-xs' : 'text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                Menunggu ({pendingCount})
              </button>
              <button
                onClick={() => setKycFilter('approved')}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all cursor-pointer ${
                  kycFilter === 'approved' ? 'bg-emerald-600 text-white shadow-xs' : 'text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                Disetujui ({sellerApplications.filter((a) => a.status === 'approved').length})
              </button>
              <button
                onClick={() => setKycFilter('rejected')}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all cursor-pointer ${
                  kycFilter === 'rejected' ? 'bg-red-600 text-white shadow-xs' : 'text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                Ditolak ({sellerApplications.filter((a) => a.status === 'rejected').length})
              </button>
              <button
                onClick={() => setKycFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all cursor-pointer ${
                  kycFilter === 'all' ? 'bg-black text-white shadow-xs' : 'text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                Semua ({sellerApplications.length})
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {filteredKycApps.length === 0 ? (
              <div className="bg-white rounded-3xl border border-neutral-200 p-12 text-center space-y-2 shadow-xs">
                <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-400 text-2xl mx-auto">
                  <i className="fas fa-clipboard-check"></i>
                </div>
                <h3 className="font-black text-sm text-neutral-800 uppercase">Tidak Ada Data Pengajuan</h3>
                <p className="text-xs text-neutral-500 max-w-xs mx-auto">
                  {kycSearch
                    ? 'Tidak ada data pengajuan yang cocok dengan pencarian Anda.'
                    : 'Belum ada pengajuan verifikasi akun toko pada status ini.'}
                </p>
              </div>
            ) : (
              filteredKycApps.map((app) => {
                const isPending = app.status === 'pending';
                const isApproved = app.status === 'approved';
                const isRejected = app.status === 'rejected';

                const cleanPhone = (app.phoneWhatsapp || '').replace(/\D/g, '');
                const waFormatted = cleanPhone.startsWith('0') ? `62${cleanPhone.slice(1)}` : cleanPhone;

                return (
                  <div
                    key={app.id || app.userId}
                    className={`bg-white border-2 rounded-3xl p-4 sm:p-5 shadow-sm space-y-4 transition-all ${
                      isPending ? 'border-amber-400 bg-amber-50/20' : isApproved ? 'border-emerald-200' : 'border-neutral-200'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-neutral-100 pb-3">
                      <div className="flex items-center space-x-3 min-w-0">
                        <img
                          src={app.userPhoto || `https://api.dicebear.com/7.x/initials/svg?seed=${app.userId}`}
                          alt={app.userName}
                          className="w-12 h-12 rounded-2xl border-2 border-neutral-300 object-cover shrink-0 cursor-pointer"
                          onClick={() => onUserClick(app.userId)}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center space-x-2">
                            <h4
                              onClick={() => onUserClick(app.userId)}
                              className="font-black text-sm sm:text-base text-neutral-900 uppercase truncate hover:underline cursor-pointer"
                            >
                              {app.fullName}
                            </h4>
                            <span className="text-[10px] text-neutral-500 font-bold">(@{app.userName})</span>
                          </div>
                          <p className="text-[11px] text-neutral-500 font-semibold">{app.userEmail}</p>
                          <p className="text-[10px] text-neutral-400 font-medium mt-0.5">
                            Diajukan: {app.submittedAt ? new Date(app.submittedAt).toLocaleString('id-ID') : 'Baru saja'}
                          </p>
                        </div>
                      </div>

                      <div className="self-start sm:self-center">
                        <span
                          className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center space-x-1.5 ${
                            isApproved
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : isPending
                              ? 'bg-amber-400 text-black border border-amber-500'
                              : 'bg-red-100 text-red-800 border border-red-300'
                          }`}
                        >
                          <i
                            className={`fas ${
                              isApproved
                                ? 'fa-circle-check text-emerald-600'
                                : isPending
                                ? 'fa-clock text-black'
                                : 'fa-circle-xmark text-red-600'
                            }`}
                          ></i>
                          <span>{isApproved ? 'Disetujui' : isPending ? 'Menunggu Review' : 'Ditolak'}</span>
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
                      <div className="bg-neutral-50 border border-neutral-200/90 rounded-2xl p-3.5 space-y-2">
                        <div className="flex items-center space-x-1.5 text-amber-700 font-black text-xs uppercase tracking-wider border-b border-neutral-200 pb-1.5">
                          <i className="fas fa-user-check text-amber-600"></i>
                          <span>Data Pemilik & Lokasi</span>
                        </div>

                        <div className="space-y-1.5 text-[11px] text-neutral-700">
                          <div className="flex justify-between">
                            <span className="text-neutral-500 font-bold">Nama Lengkap:</span>
                            <span className="font-extrabold text-neutral-900">{app.fullName}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-neutral-500 font-bold">Telepon / WA:</span>
                            <div className="flex items-center space-x-1.5">
                              <span className="font-bold text-neutral-900">{app.phoneWhatsapp || '-'}</span>
                              {cleanPhone && (
                                <a
                                  href={`https://wa.me/${waFormatted}?text=Halo%20${encodeURIComponent(
                                    app.fullName
                                  )},%20kami%20dari%20Tim%20Admin%20Vimos%20mengenai%20verifikasi%20toko%20Anda.`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] font-black px-2 py-0.5 rounded-md flex items-center space-x-1"
                                >
                                  <i className="fab fa-whatsapp"></i>
                                  <span>WA</span>
                                </a>
                              )}
                            </div>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-neutral-500 font-bold">Kota & Provinsi:</span>
                            <span className="font-bold text-neutral-900">
                              {app.city || '-'}, {app.province || '-'}
                            </span>
                          </div>
                          <div className="pt-1 border-t border-neutral-200">
                            <span className="text-neutral-500 font-bold block mb-0.5">Alamat Lengkap:</span>
                            <p className="font-medium text-neutral-800 bg-white p-2 rounded-xl border border-neutral-200 leading-snug">
                              {app.address || '-'}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="bg-neutral-50 border border-neutral-200/90 rounded-2xl p-3.5 space-y-2">
                        <div className="flex items-center space-x-1.5 text-amber-700 font-black text-xs uppercase tracking-wider border-b border-neutral-200 pb-1.5">
                          <i className="fas fa-store text-amber-600"></i>
                          <span>Informasi Toko</span>
                        </div>

                        <div className="space-y-1.5 text-[11px] text-neutral-700">
                          <div className="flex justify-between">
                            <span className="text-neutral-500 font-bold">Nama Toko:</span>
                            <span className="font-black text-neutral-900 text-xs">{app.shopName}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-neutral-500 font-bold">Kategori:</span>
                            <span className="bg-amber-100 text-amber-900 font-extrabold px-2 py-0.5 rounded-md text-[10px]">
                              {app.shopCategory || 'Umum'}
                            </span>
                          </div>
                          <div>
                            <span className="text-neutral-500 font-bold block mb-0.5">Deskripsi Toko:</span>
                            <p className="font-medium text-neutral-800 bg-white p-2 rounded-xl border border-neutral-200 leading-snug">
                              {app.shopDescription || 'Tidak ada deskripsi.'}
                            </p>
                          </div>
                          {isRejected && app.rejectionReason && (
                            <div className="p-2 bg-red-50 border border-red-200 rounded-xl text-red-700">
                              <span className="font-bold block text-[10px] uppercase">Alasan Penolakan:</span>
                              <p className="text-[11px] font-medium">{app.rejectionReason}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* OWNER PHOTO PREVIEW */}
                    <div className="bg-neutral-100/70 p-3.5 rounded-2xl border border-neutral-200 space-y-2">
                      <span className="text-xs font-black uppercase text-neutral-800 flex items-center space-x-1.5">
                        <i className="fas fa-camera text-neutral-600"></i>
                        <span>Foto Pengguna / Pemilik Toko</span>
                      </span>

                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div
                          onClick={() => {
                            const docUrl = app.ownerPhotoURL || app.userPhoto || '';
                            if (!docUrl) return;
                            setFullscreenDoc({
                              url: docUrl,
                              title: 'Foto Pengguna / Pemilik Toko',
                              applicantName: app.fullName
                            });
                          }}
                          className="bg-white border-2 border-dashed border-neutral-300 hover:border-black rounded-2xl p-2 cursor-pointer group transition-all w-44 shrink-0"
                        >
                          <div className="h-28 bg-neutral-900 rounded-xl overflow-hidden relative">
                            {app.ownerPhotoURL || app.userPhoto ? (
                              <img
                                src={app.ownerPhotoURL || app.userPhoto}
                                alt="Foto Pengguna"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-neutral-400 text-xs font-bold">
                                Tidak ada foto
                              </div>
                            )}
                          </div>
                          <p className="text-center text-[10px] font-black text-neutral-700 mt-1.5 uppercase">
                            Klik untuk perbesar
                          </p>
                        </div>

                        <div className="text-[11px] text-neutral-600 p-3 bg-white rounded-xl border border-neutral-200 flex-1">
                          <span className="text-amber-800 font-bold block text-[10px] uppercase mb-0.5">
                            Privasi Pengguna Terjaga
                          </span>
                          <span>
                            Verifikasi toko dilakukan dengan foto pemilik dan data kontak aktif tanpa meminta unggahan dokumen identitas sensitif.
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-neutral-100">
                      {isPending && (
                        <>
                          <button
                            onClick={() => {
                              setRejectingApp(app);
                              setRejectionReasonInput('');
                            }}
                            className="px-4 py-2 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded-xl text-xs font-black uppercase transition-all flex items-center space-x-1.5 cursor-pointer"
                          >
                            <i className="fas fa-xmark"></i>
                            <span>Tolak Pengajuan</span>
                          </button>
                          <button
                            onClick={() => handleApproveSeller(app)}
                            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm flex items-center space-x-1.5 cursor-pointer"
                          >
                            <i className="fas fa-check"></i>
                            <span>Setujui Akun Toko</span>
                          </button>
                        </>
                      )}

                      {isApproved && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
                            Toko Aktif & Terverifikasi
                          </span>
                          <button
                            onClick={() => requestDeleteShopFromKyc(app)}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-[10px] font-black rounded-xl uppercase transition-all flex items-center space-x-1 cursor-pointer"
                          >
                            <i className="fas fa-trash-can text-[9px]"></i>
                            <span>Hapus Toko & Produk</span>
                          </button>
                        </div>
                      )}

                      {isRejected && (
                        <button
                          onClick={() => handleApproveSeller(app)}
                          className="px-4 py-2 bg-neutral-900 hover:bg-black text-white rounded-xl text-xs font-black uppercase transition-all flex items-center space-x-1 cursor-pointer"
                        >
                          <i className="fas fa-rotate-left text-xs text-amber-400"></i>
                          <span>Setujui Ulang</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* TAB 2: MARKETPLACE MODERATION (TOKO, PRODUK & TRANSAKSI) */}
      {/* ============================================================= */}
      {activeTab === 'marketplace' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2 justify-between">
            <div className="flex items-center space-x-1.5 bg-white p-1 rounded-2xl border border-neutral-200 shrink-0 tabular-nums">
              <button
                onClick={() => setMarketSubTab('shops')}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-black uppercase transition-all cursor-pointer ${
                  marketSubTab === 'shops' ? 'bg-black text-white' : 'text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                Toko ({shops.length})
              </button>
              <button
                onClick={() => setMarketSubTab('items')}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-black uppercase transition-all cursor-pointer ${
                  marketSubTab === 'items' ? 'bg-black text-white' : 'text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                Produk ({shopItems.length})
              </button>
              <button
                onClick={() => setMarketSubTab('orders')}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-black uppercase transition-all cursor-pointer ${
                  marketSubTab === 'orders' ? 'bg-black text-white' : 'text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                Transaksi ({shopOrders.length})
              </button>
            </div>

            <div className="relative flex-1">
              <i className="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 text-xs"></i>
              <input
                type="text"
                value={marketSearch}
                onChange={(e) => setMarketSearch(e.target.value)}
                placeholder={
                  marketSubTab === 'shops'
                    ? 'Cari nama toko, pemilik, atau lokasi...'
                    : marketSubTab === 'items'
                    ? 'Cari nama produk, kategori, atau penjual...'
                    : 'Cari ID pesanan, produk, toko, atau pembeli...'
                }
                className="w-full bg-white border border-neutral-300 rounded-2xl pl-9 pr-8 py-2.5 text-xs font-bold focus:outline-none focus:border-black"
              />
              {marketSearch && (
                <button
                  onClick={() => setMarketSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-black text-xs cursor-pointer"
                >
                  <i className="fas fa-xmark"></i>
                </button>
              )}
            </div>
          </div>

          {/* SUBTAB: SHOPS */}
          {marketSubTab === 'shops' && (
            <div className="space-y-3">
              {filteredShops.length === 0 ? (
                <div className="bg-white rounded-3xl border border-neutral-200 p-10 text-center text-xs font-bold text-neutral-400">
                  Tidak ada toko yang sesuai.
                </div>
              ) : (
                filteredShops.map((shop) => {
                  const shopProductCount = shopItems.filter(
                    (i) => i.shopId === shop.id || i.ownerId === shop.ownerId
                  ).length;
                  const managerCount = Object.keys(shop.managers || {}).length;

                  return (
                    <div
                      key={shop.id}
                      className="bg-white border border-neutral-200 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <img
                          src={shop.logoURL || shop.ownerPhoto || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(shop.shopName || 'Toko')}`}
                          alt={shop.shopName}
                          className="w-12 h-12 rounded-2xl object-cover border border-neutral-300 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center space-x-1.5 flex-wrap">
                            <h4 className="font-black text-sm text-neutral-900 truncate">{shop.shopName}</h4>
                            {shop.isVerified && (
                              <span className="bg-amber-100 text-amber-800 text-[9px] font-black uppercase px-2 py-0.5 rounded-md">
                                Terverifikasi
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-neutral-500 truncate">
                            Pemilik: <span className="font-bold text-neutral-800">{shop.ownerName}</span> · {shop.location || 'Indonesia'}
                          </p>
                          <p className="text-[11px] font-bold text-neutral-400 tabular-nums mt-0.5">
                            {shopProductCount} produk · {managerCount} pengelola tambahan
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleToggleVerifyShop(shop)}
                          className={`px-3 py-2 rounded-xl text-[11px] font-black uppercase cursor-pointer border transition-colors ${
                            shop.isVerified
                              ? 'bg-neutral-100 border-neutral-300 text-neutral-700 hover:bg-neutral-200'
                              : 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700'
                          }`}
                        >
                          {shop.isVerified ? 'Cabut Centang' : 'Verifikasi'}
                        </button>
                        <button
                          onClick={() => requestDeleteShopFromMarketplace(shop)}
                          className="px-3 py-2 rounded-xl text-[11px] font-black uppercase bg-red-50 text-red-600 border border-red-200 hover:bg-red-600 hover:text-white transition-colors cursor-pointer"
                        >
                          Hapus Toko
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* SUBTAB: MARKET ITEMS */}
          {marketSubTab === 'items' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredMarketItems.length === 0 ? (
                <div className="col-span-full bg-white rounded-3xl border border-neutral-200 p-10 text-center text-xs font-bold text-neutral-400">
                  Tidak ada produk ditemukan.
                </div>
              ) : (
                filteredMarketItems.map((item) => (
                  <div
                    key={item.id}
                    className="bg-white border border-neutral-200 rounded-2xl p-3.5 shadow-xs flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <img
                        src={item.imageURL || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=200'}
                        alt={item.name}
                        className="w-14 h-14 rounded-xl object-cover border border-neutral-200 shrink-0"
                      />
                      <div className="min-w-0">
                        <h4 className="font-bold text-xs text-neutral-900 truncate">{item.name}</h4>
                        <p className="text-xs font-black text-amber-700 tabular-nums">{formatIDR(item.price)}</p>
                        <p className="text-[11px] text-neutral-500 truncate">
                          Oleh {item.ownerName} · Stok <span className="tabular-nums font-bold">{item.stock}</span> · {item.category}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => requestDeleteMarketItem(item)}
                      className="px-3 py-2 rounded-xl bg-red-50 hover:bg-red-600 text-red-600 hover:text-white border border-red-200 text-[10px] font-black uppercase transition-colors cursor-pointer shrink-0"
                    >
                      Hapus
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* SUBTAB: MARKET ORDERS */}
          {marketSubTab === 'orders' && (
            <div className="space-y-3">
              <div className="flex items-center space-x-1.5 overflow-x-auto pb-1">
                {(['all', 'pending', 'processing', 'completed', 'cancelled'] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setOrderStatusFilter(status)}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase cursor-pointer border transition-colors ${
                      orderStatusFilter === status
                        ? 'bg-neutral-900 text-white border-neutral-900'
                        : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-100'
                    }`}
                  >
                    {status === 'all' ? 'Semua' : status}
                  </button>
                ))}
              </div>

              {filteredMarketOrders.length === 0 ? (
                <div className="bg-white rounded-3xl border border-neutral-200 p-10 text-center text-xs font-bold text-neutral-400">
                  Belum ada pesanan pada filter ini.
                </div>
              ) : (
                filteredMarketOrders.map((order) => (
                  <div
                    key={order.id}
                    className="bg-white border border-neutral-200 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-black uppercase text-neutral-400 tabular-nums">
                          #{order.id.slice(-6)}
                        </span>
                        <h4 className="font-bold text-xs text-neutral-900">
                          {order.itemName} (x{order.quantity})
                        </h4>
                        <span
                          className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                            order.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : order.status === 'cancelled'
                              ? 'bg-red-100 text-red-700'
                              : order.status === 'processing'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {order.status}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-600">
                        Pembeli: <span className="font-bold text-neutral-900">{order.buyerName}</span> · Toko:{' '}
                        <span className="font-bold text-neutral-900">{order.shopName}</span>
                      </p>
                      <p className="text-xs font-black text-neutral-900 tabular-nums">
                        Total: {formatIDR(order.totalPrice)}{' '}
                        <span className="text-[10px] font-medium text-neutral-400">
                          · {new Date(order.timestamp).toLocaleString('id-ID')}
                        </span>
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                      {order.status !== 'completed' && (
                        <button
                          onClick={() => handleUpdateOrderByAdmin(order, 'completed')}
                          className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase cursor-pointer"
                        >
                          Selesaikan
                        </button>
                      )}
                      {order.status !== 'cancelled' && (
                        <button
                          onClick={() =>
                            setConfirmModal({
                              title: 'Batalkan Pesanan',
                              message: `Batalkan pesanan "${order.itemName}" oleh ${order.buyerName}? Stok produk akan dikembalikan otomatis.`,
                              confirmLabel: 'Batalkan Pesanan',
                              variant: 'warning',
                              onConfirm: () => handleUpdateOrderByAdmin(order, 'cancelled')
                            })
                          }
                          className="px-2.5 py-1.5 bg-red-50 hover:bg-red-600 text-red-600 hover:text-white border border-red-200 rounded-xl text-[10px] font-black uppercase cursor-pointer transition-colors"
                        >
                          Batalkan
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* ============================================================= */}
      {/* TAB 3: CONTENT MODERATION (POSTINGAN & REELS) */}
      {/* ============================================================= */}
      {activeTab === 'content' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <i className="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 text-xs"></i>
              <input
                type="text"
                value={contentSearch}
                onChange={(e) => setContentSearch(e.target.value)}
                placeholder="Cari caption atau nama pembuat postingan..."
                className="w-full bg-white border border-neutral-300 rounded-2xl pl-9 pr-8 py-2.5 text-xs font-bold focus:outline-none focus:border-black"
              />
              {contentSearch && (
                <button
                  onClick={() => setContentSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-black text-xs cursor-pointer"
                >
                  <i className="fas fa-xmark"></i>
                </button>
              )}
            </div>

            <div className="flex items-center space-x-1.5 bg-white p-1 rounded-2xl border border-neutral-200 shrink-0 overflow-x-auto">
              {[
                { key: 'all', label: 'Semua' },
                { key: 'active', label: 'Aktif' },
                { key: 'takendown', label: 'Ditakedown' },
                { key: 'video', label: 'Video' },
                { key: 'photo', label: 'Foto' }
              ].map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setContentFilter(opt.key as typeof contentFilter)}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase cursor-pointer ${
                    contentFilter === opt.key ? 'bg-black text-white' : 'text-neutral-600 hover:bg-neutral-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {filteredPosts.length === 0 ? (
              <div className="bg-white rounded-3xl border border-neutral-200 p-10 text-center text-xs font-bold text-neutral-400">
                Tidak ada postingan yang cocok.
              </div>
            ) : (
              filteredPosts.map((post) => (
                <div
                  key={post.id}
                  className={`bg-white border rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    post.isTakenDown ? 'border-amber-300 bg-amber-50/40' : 'border-neutral-200'
                  }`}
                >
                  <div className="flex items-start space-x-3 min-w-0 flex-1">
                    {post.photoURL ? (
                      <img
                        src={post.photoURL}
                        alt="Media postingan"
                        className="w-16 h-16 rounded-xl object-cover border border-neutral-200 shrink-0"
                      />
                    ) : post.videoURL ? (
                      <div className="w-16 h-16 rounded-xl bg-neutral-900 text-white flex items-center justify-center shrink-0">
                        <i className="fas fa-film text-lg text-amber-400"></i>
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-neutral-100 text-neutral-400 flex items-center justify-center shrink-0">
                        <i className="fas fa-align-left text-lg"></i>
                      </div>
                    )}

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center space-x-2 flex-wrap">
                        <button
                          onClick={() => onUserClick(post.userId)}
                          className="font-black text-xs text-neutral-900 hover:underline cursor-pointer"
                        >
                          {post.userName}
                        </button>
                        <span className="text-[10px] text-neutral-400">
                          {new Date(post.timestamp).toLocaleString('id-ID')}
                        </span>
                        {post.isTakenDown && (
                          <span className="text-[9px] font-black uppercase bg-amber-400 text-black px-2 py-0.5 rounded-full">
                            Ditakedown
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-neutral-700 line-clamp-2">
                        {post.text || <span className="italic text-neutral-400">(Tanpa keterangan teks)</span>}
                      </p>
                      <div className="flex items-center space-x-3 text-[11px] font-bold text-neutral-500 tabular-nums">
                        <span>
                          <i className="fas fa-heart text-red-500 mr-1"></i>
                          {(post.likes || []).length}
                        </span>
                        <span>
                          <i className="fas fa-comment text-neutral-400 mr-1"></i>
                          {(post.comments || []).length}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {onTakeDownPost && (
                      <button
                        onClick={() => {
                          onTakeDownPost(post.id);
                          showToast(
                            post.isTakenDown
                              ? 'Postingan berhasil dipulihkan ke feed.'
                              : 'Postingan berhasil ditakedown sementara.',
                            'success'
                          );
                        }}
                        className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase cursor-pointer border transition-colors ${
                          post.isTakenDown
                            ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                            : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                        }`}
                      >
                        {post.isTakenDown ? 'Pulihkan' : 'Takedown'}
                      </button>
                    )}

                    {onDeletePost && (
                      <button
                        onClick={() =>
                          setConfirmModal({
                            title: 'Hapus Postingan Permanen',
                            message: `Hapus permanen postingan milik ${post.userName}? Tindakan ini tidak dapat dibatalkan.`,
                            confirmLabel: 'Hapus Permanen',
                            variant: 'danger',
                            onConfirm: () => {
                              onDeletePost(post.id);
                              showToast('Postingan berhasil dihapus permanen.', 'success');
                            }
                          })
                        }
                        className="px-3 py-2 rounded-xl text-[10px] font-black uppercase bg-red-50 text-red-600 border border-red-200 hover:bg-red-600 hover:text-white transition-colors cursor-pointer"
                      >
                        Hapus
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* TAB 4: USER ORCHESTRATION & ROLES */}
      {/* ============================================================= */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-black/40">
                <i className="fas fa-search text-xs"></i>
              </span>
              <input
                type="text"
                value={adminSearch}
                onChange={(e) => setAdminSearch(e.target.value)}
                placeholder="Cari berdasarkan nama, email, atau role..."
                className="w-full bg-white border border-neutral-300 rounded-2xl pl-10 pr-4 py-2.5 text-xs focus:outline-none focus:border-black font-bold"
              />
            </div>

            <div className="flex items-center space-x-1.5 bg-white p-1 rounded-2xl border border-neutral-200 shrink-0 overflow-x-auto tabular-nums">
              {[
                { key: 'all', label: `Semua (${users.length})` },
                { key: 'online', label: `Online (${overviewStats.onlineUsers})` },
                { key: 'admin', label: `Admin (${overviewStats.adminUsers})` },
                { key: 'merchant', label: 'Toko' },
                { key: 'banned', label: `Ban (${overviewStats.bannedUsers})` }
              ].map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setUserFilter(opt.key as typeof userFilter)}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase cursor-pointer ${
                    userFilter === opt.key ? 'bg-black text-white' : 'text-neutral-600 hover:bg-neutral-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {filteredUsers.length === 0 ? (
              <div className="bg-white rounded-3xl border border-neutral-200 py-16 text-center text-neutral-400">
                <i className="fas fa-search-minus text-3xl mb-3"></i>
                <p className="font-black uppercase tracking-widest text-xs">Tidak ada pengguna ditemukan</p>
              </div>
            ) : (
              filteredUsers.map((user) => {
                const isSelf = currentUser?.id === user.id;
                const isMaster = isProtectedMasterAdmin(user);
                const cannotBan = isSelf || isMaster;

                return (
                  <div
                    key={user.id}
                    className="p-4 border border-neutral-200 rounded-2xl bg-white shadow-xs flex flex-col space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        <img
                          src={
                            user.photoURL ||
                            `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.name || 'User')}`
                          }
                          className={`w-12 h-12 rounded-full border-2 border-neutral-900 object-cover cursor-pointer ${
                            user.isBanned ? 'grayscale opacity-40' : ''
                          }`}
                          onClick={() => onUserClick(user.id)}
                          alt={user.name}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-1.5 flex-wrap">
                            <h4
                              onClick={() => onUserClick(user.id)}
                              className={`font-black text-sm tracking-tight truncate cursor-pointer hover:underline ${
                                user.isBanned ? 'text-gray-400 line-through' : 'text-black'
                              }`}
                            >
                              {user.name}
                            </h4>
                            {user.isAdmin && (
                              <span className="bg-amber-400 text-black text-[8px] font-black px-1.5 py-0.5 rounded uppercase">
                                Admin
                              </span>
                            )}
                            {user.isVerifiedSeller && (
                              <span className="bg-neutral-900 text-white text-[8px] font-black px-1.5 py-0.5 rounded uppercase">
                                Merchant
                              </span>
                            )}
                            {user.role && (
                              <span
                                className="text-white text-[8px] font-black px-1.5 py-0.5 rounded uppercase"
                                style={{ backgroundColor: user.roleColor || '#000000' }}
                              >
                                {user.role}
                              </span>
                            )}
                            {isSelf && (
                              <span className="text-[8px] font-black uppercase bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded">
                                Anda
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] font-semibold text-neutral-500 truncate">{user.email}</p>
                        </div>
                      </div>
                      {user.isBanned && (
                        <span className="text-[9px] font-black text-red-600 border border-red-600 px-2.5 py-1 rounded-full uppercase shrink-0">
                          Diblokir
                        </span>
                      )}
                    </div>

                    {/* Countdown Status Hapus Otomatis (30 Hari Inaktif) */}
                    {(() => {
                      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
                      const lastActive = Math.max(user.lastSeen || 0, user.createdAt || 0, 0);
                      const elapsed = lastActive ? Date.now() - lastActive : 0;
                      const remainingMs = Math.max(0, THIRTY_DAYS_MS - elapsed);
                      const daysLeft = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
                      const hoursLeft = Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

                      return (
                        <div className="flex items-center justify-between text-[11px] bg-neutral-50 px-3 py-2 rounded-xl border border-neutral-200 tabular-nums">
                          <span className="text-neutral-500 font-bold flex items-center space-x-1.5">
                            <i className="fas fa-hourglass-half text-neutral-400"></i>
                            <span>Waktu Hapus Otomatis:</span>
                          </span>
                          {user.isAdmin ? (
                            <span className="font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200 text-[10px] uppercase">
                              Terlindungi (Admin)
                            </span>
                          ) : user.isOnline ? (
                            <span className="font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200 text-[10px] uppercase">
                              Online (Aman 30 Hari)
                            </span>
                          ) : (
                            <span
                              className={`font-black px-2 py-0.5 rounded-lg border text-[10px] uppercase ${
                                daysLeft <= 3
                                  ? 'text-red-700 bg-red-50 border-red-300'
                                  : daysLeft <= 10
                                  ? 'text-amber-700 bg-amber-50 border-amber-300'
                                  : 'text-neutral-700 bg-white border-neutral-200'
                              }`}
                            >
                              {daysLeft <= 3
                                ? `Sisa ${daysLeft}h ${hoursLeft}j (Segera Terhapus)`
                                : `Sisa ${daysLeft} hari lagi`}
                            </span>
                          )}
                        </div>
                      );
                    })()}

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={async () => {
                          if (!onToggleAdmin) return;
                          const result = await onToggleAdmin(user.id, Boolean(user.isAdmin));
                          if (result && result.message) {
                            showToast(result.message, result.success ? 'success' : 'error');
                          }
                        }}
                        disabled={isMaster}
                        className={`flex-1 min-w-[140px] py-2 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center space-x-1 ${
                          isMaster
                            ? 'bg-neutral-100 border border-neutral-200 text-neutral-400 cursor-not-allowed'
                            : user.isAdmin
                            ? 'bg-amber-400 border border-black text-black hover:bg-amber-500 cursor-pointer'
                            : 'bg-neutral-900 border border-black text-white hover:bg-black cursor-pointer'
                        }`}
                      >
                        <i className={`fas ${user.isAdmin ? 'fa-shield-minus' : 'fa-shield-halved'} text-xs`}></i>
                        <span>{isMaster ? 'Master Admin' : user.isAdmin ? 'Cabut Admin' : 'Jadikan Admin'}</span>
                      </button>

                      <button
                        onClick={() => {
                          setEditingRoleUser(user);
                          setNewRoleValue(user.role || '');
                          setNewRoleColor(user.roleColor || '#000000');
                        }}
                        className="flex-1 min-w-[110px] bg-white border border-neutral-900 text-black py-2 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-black hover:text-white transition-all cursor-pointer"
                      >
                        Set Role
                      </button>

                      <button
                        disabled={cannotBan}
                        onClick={() => {
                          if (cannotBan) return;
                          if (user.isBanned) {
                            onBanUser(user.id);
                            showToast(`Akun ${user.name} berhasil dipulihkan.`, 'success');
                          } else {
                            setConfirmModal({
                              title: 'Blokir Pengguna',
                              message: `Blokir akses akun "${user.name}" (${user.email})? Pengguna tidak akan dapat masuk sampai blokir dicabut.`,
                              confirmLabel: 'Blokir Akun',
                              variant: 'danger',
                              onConfirm: () => {
                                onBanUser(user.id);
                                showToast(`Akun ${user.name} telah diblokir.`, 'success');
                              }
                            });
                          }
                        }}
                        className={`flex-1 min-w-[100px] border py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                          cannotBan
                            ? 'border-neutral-200 text-neutral-300 bg-neutral-50 cursor-not-allowed'
                            : user.isBanned
                            ? 'border-emerald-600 text-emerald-700 hover:bg-emerald-600 hover:text-white cursor-pointer'
                            : 'border-red-600 text-red-600 hover:bg-red-600 hover:text-white cursor-pointer'
                        }`}
                      >
                        {user.isBanned ? 'Pulihkan' : 'Blokir'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* TAB 5: BROADCAST CENTER & NOTIFIKASI MASSAL */}
      {/* ============================================================= */}
      {activeTab === 'broadcast' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Official Proclamation Form */}
            <form onSubmit={handleBroadcastSubmit} className="bg-white border border-neutral-200 rounded-2xl p-4 sm:p-5 space-y-3 shadow-xs">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-neutral-900">
                  {editingAnnId ? 'Edit Pengumuman Resmi' : 'Buat Pengumuman Banner'}
                </h3>
                <p className="text-[11px] text-neutral-500">
                  Ditampilkan di papan pengumuman utama aplikasi untuk seluruh pengguna.
                </p>
              </div>
              <textarea
                value={broadcastText}
                onChange={(e) => setBroadcastText(e.target.value)}
                placeholder="Tulis pengumuman resmi untuk seluruh komunitas..."
                className="w-full bg-neutral-50 border border-neutral-300 rounded-2xl p-3.5 text-xs font-bold focus:outline-none focus:border-black focus:bg-white transition-all h-28 resize-none"
              />
              <div className="flex space-x-2">
                {editingAnnId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAnnId(null);
                      setBroadcastText('');
                    }}
                    className="px-4 py-2.5 border border-neutral-300 rounded-xl text-[11px] font-black uppercase cursor-pointer hover:bg-neutral-100"
                  >
                    Batal
                  </button>
                )}
                <button
                  type="submit"
                  className="flex-1 bg-black text-white py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider shadow-sm active:scale-95 transition-all cursor-pointer"
                >
                  {editingAnnId ? 'Simpan Perubahan' : 'Publikasikan Pengumuman'}
                </button>
              </div>
            </form>

            {/* Mass Direct Notification Form */}
            <form onSubmit={handleSendMassNotification} className="bg-white border border-neutral-200 rounded-2xl p-4 sm:p-5 space-y-3 shadow-xs">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-neutral-900">
                  Kirim Notifikasi Massal
                </h3>
                <p className="text-[11px] text-neutral-500">
                  Kirim pesan masuk langsung ke tab Notifikasi semua pengguna aktif ({users.filter((u) => !u.isBanned && u.id !== currentUser?.id).length} akun).
                </p>
              </div>
              <textarea
                value={massNotifText}
                onChange={(e) => setMassNotifText(e.target.value)}
                placeholder="Misal: Halo! Fitur baru Marketplace & Pengelola Toko kini sudah tersedia..."
                className="w-full bg-neutral-50 border border-neutral-300 rounded-2xl p-3.5 text-xs font-bold focus:outline-none focus:border-black focus:bg-white transition-all h-28 resize-none"
              />
              <button
                type="submit"
                disabled={isSendingMassNotif || !massNotifText.trim()}
                className="w-full bg-amber-400 hover:bg-amber-500 disabled:opacity-50 text-black py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider shadow-sm transition-all cursor-pointer"
              >
                {isSendingMassNotif ? 'Mengirim ke Semua Pengguna...' : 'Kirim Notifikasi ke Semua User'}
              </button>
            </form>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-neutral-500">
              Pengumuman Aktif ({announcements.length})
            </h3>
            {announcements.length === 0 ? (
              <div className="bg-white rounded-2xl border border-neutral-200 p-10 text-center text-xs font-bold text-neutral-400">
                Belum ada pengumuman aktif.
              </div>
            ) : (
              announcements.map((ann) => (
                <div
                  key={ann.id}
                  className="p-4 border border-neutral-200 rounded-2xl bg-white shadow-xs space-y-3"
                >
                  <p className="text-sm font-bold text-neutral-900">{ann.text}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-neutral-400">
                      {new Date(ann.timestamp).toLocaleString('id-ID')}
                    </span>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => startEditAnn(ann)}
                        className="text-[10px] font-black uppercase bg-neutral-100 hover:bg-neutral-200 text-neutral-800 px-3 py-1 rounded-full cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() =>
                          setConfirmModal({
                            title: 'Hapus Pengumuman',
                            message: 'Hapus pengumuman ini dari daftar siaran aktif?',
                            confirmLabel: 'Hapus',
                            variant: 'danger',
                            onConfirm: () => {
                              onDeleteAnnouncement(ann.id);
                              showToast('Pengumuman berhasil dihapus.', 'success');
                            }
                          })
                        }
                        className="text-[10px] font-black uppercase bg-red-50 hover:bg-red-600 text-red-600 hover:text-white px-3 py-1 rounded-full cursor-pointer transition-colors"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* FULLSCREEN DOCUMENT VIEWER MODAL */}
      {fullscreenDoc && (
        <div
          className="fixed inset-0 z-[160] bg-black/95 backdrop-blur-md flex flex-col items-center justify-between p-4 sm:p-6 animate-fade-in"
          onClick={() => setFullscreenDoc(null)}
        >
          <div className="w-full max-w-4xl flex items-center justify-between py-2 text-white z-10" onClick={(e) => e.stopPropagation()}>
            <div>
              <p className="font-extrabold text-sm text-white">{fullscreenDoc.title}</p>
              <p className="text-xs text-neutral-400">Pemilik: {fullscreenDoc.applicantName}</p>
            </div>
            <button
              onClick={() => setFullscreenDoc(null)}
              className="w-10 h-10 rounded-full bg-neutral-800 hover:bg-red-600 text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <i className="fas fa-xmark text-lg"></i>
            </button>
          </div>

          <div className="flex-1 flex items-center justify-center max-w-4xl w-full my-auto overflow-hidden p-2" onClick={(e) => e.stopPropagation()}>
            <img
              src={fullscreenDoc.url}
              alt={fullscreenDoc.title}
              className="max-h-[80vh] max-w-full object-contain rounded-2xl shadow-2xl ring-1 ring-white/20 animate-scale-up"
            />
          </div>

          <div className="text-neutral-400 text-xs py-2">
            Klik di luar gambar atau tombol X untuk menutup
          </div>
        </div>
      )}

      {/* REJECTION REASON MODAL */}
      {rejectingApp && (
        <div className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-neutral-100 space-y-4 animate-scale-up">
            <div className="flex items-center space-x-3 text-red-600">
              <div className="w-10 h-10 rounded-2xl bg-red-100 flex items-center justify-center text-lg">
                <i className="fas fa-triangle-exclamation"></i>
              </div>
              <div>
                <h3 className="font-black text-base text-neutral-900">Tolak Pengajuan Toko</h3>
                <p className="text-xs text-neutral-500">
                  {rejectingApp.fullName} ({rejectingApp.shopName})
                </p>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-neutral-600 block mb-1">
                Catatan Alasan Penolakan (Akan dikirim ke pengguna):
              </label>
              <textarea
                rows={3}
                placeholder="Misal: Foto pemilik buram atau nomor WhatsApp tidak aktif..."
                value={rejectionReasonInput}
                onChange={(e) => setRejectionReasonInput(e.target.value)}
                className="w-full bg-neutral-50 border border-neutral-300 rounded-2xl p-3 text-xs font-medium focus:outline-none focus:border-black focus:bg-white resize-none"
              />
            </div>

            <div className="flex space-x-2 pt-1">
              <button
                onClick={() => setRejectingApp(null)}
                className="flex-1 py-3 rounded-2xl border border-neutral-300 text-neutral-700 text-xs font-bold hover:bg-neutral-100 cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleRejectSeller}
                className="flex-1 py-3 rounded-2xl bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-wider shadow-md active:scale-95 cursor-pointer"
              >
                Kirim Penolakan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT ROLE MODAL */}
      {editingRoleUser && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white border-2 border-black w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl flex flex-col">
            <div className="p-5 bg-black text-white">
              <h3 className="font-black uppercase tracking-wider text-sm">Atur Role Pengguna</h3>
              <p className="text-[11px] text-neutral-400 mt-0.5">Tetapkan lencana untuk {editingRoleUser.name}</p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase text-neutral-500 block mb-1.5">
                  Pilih Cepat (Preset)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {ROLE_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setNewRoleValue(preset.label);
                        setNewRoleColor(preset.color);
                      }}
                      className="px-2.5 py-1 rounded-lg text-[10px] font-black text-white cursor-pointer hover:opacity-90"
                      style={{ backgroundColor: preset.color }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-neutral-500 block mb-1">
                  Nama Role Custom
                </label>
                <input
                  type="text"
                  autoFocus
                  value={newRoleValue}
                  onChange={(e) => setNewRoleValue(e.target.value)}
                  placeholder="Contoh: Moderator, VIP..."
                  className="w-full bg-neutral-50 border border-neutral-300 rounded-xl px-3.5 py-2.5 text-xs font-bold focus:outline-none focus:border-black"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-neutral-500 block mb-1.5">
                  Warna Lencana
                </label>
                <div className="flex flex-wrap gap-2 p-2.5 bg-neutral-50 rounded-xl border border-neutral-200">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewRoleColor(color)}
                      className={`w-6 h-6 rounded-full border-2 cursor-pointer transition-transform ${
                        newRoleColor === color ? 'border-black scale-115' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onSetRole(editingRoleUser.id, '', '#000000');
                    setEditingRoleUser(null);
                    showToast(`Role ${editingRoleUser.name} dikosongkan.`, 'success');
                  }}
                  className="px-3 py-2.5 rounded-xl border border-red-200 text-red-600 text-[10px] font-black uppercase hover:bg-red-50 cursor-pointer"
                >
                  Hapus Role
                </button>
                <button
                  type="button"
                  onClick={() => setEditingRoleUser(null)}
                  className="flex-1 border border-neutral-300 py-2.5 rounded-xl font-black uppercase text-xs cursor-pointer hover:bg-neutral-100"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSetRole(editingRoleUser.id, newRoleValue.trim(), newRoleColor);
                    showToast(`Role "${newRoleValue.trim() || 'Kosong'}" disimpan untuk ${editingRoleUser.name}.`, 'success');
                    setEditingRoleUser(null);
                  }}
                  className="flex-1 bg-black text-white py-2.5 rounded-xl font-black uppercase text-xs cursor-pointer"
                >
                  Simpan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REUSABLE IN-APP CONFIRMATION MODAL */}
      {confirmModal && (
        <div className="fixed inset-0 z-[165] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-neutral-200 space-y-4 animate-scale-up">
            <div className="flex items-start space-x-3">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                  confirmModal.variant === 'danger' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'
                }`}
              >
                <i className="fas fa-triangle-exclamation"></i>
              </div>
              <div>
                <h3 className="font-black text-sm text-neutral-900">{confirmModal.title}</h3>
                <p className="text-xs text-neutral-600 mt-1 leading-relaxed">{confirmModal.message}</p>
              </div>
            </div>

            <div className="flex space-x-2 pt-1">
              <button
                type="button"
                disabled={isConfirmRunning}
                onClick={() => setConfirmModal(null)}
                className="flex-1 py-2.5 rounded-xl border border-neutral-300 text-neutral-700 text-xs font-bold hover:bg-neutral-100 cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isConfirmRunning}
                onClick={executeConfirmModal}
                className={`flex-1 py-2.5 rounded-xl text-white text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50 ${
                  confirmModal.variant === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                {isConfirmRunning ? 'Memproses...' : confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
