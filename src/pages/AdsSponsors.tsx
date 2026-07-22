import React, { useState } from 'react';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Eye, 
  Search, 
  Filter, 
  Download,
  TrendingUp,
  DollarSign,
  Users,
  Calendar,
  Image,
  ExternalLink,
  Play,
  Pause,
  BarChart3,
  Target,
  MousePointer,
  Activity
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useSponsors, useAdvertisements, useCampaigns, useWebsiteAds } from '../hooks/useSupabaseData';
import { Card, CardHeader, CardContent } from '../components/UI/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/UI/Table';
import { Badge } from '../components/UI/Badge';
import { Button } from '../components/UI/Button';
import { apiClient } from '../lib/apiClient';
import { csvFilename, downloadCsv } from '../lib/exportCsv';

interface Advertisement {
  id: string;
  title: string;
  advertiser: string;
  type: 'banner' | 'video' | 'sponsored_post' | 'popup';
  placement: 'header' | 'sidebar' | 'footer' | 'event_page' | 'mobile_app';
  startDate: string;
  endDate: string;
  budget: number;
  spent: number;
  impressions: number;
  clicks: number;
  status: 'active' | 'paused' | 'completed' | 'draft';
  ctr: number; // Click-through rate
  cpm: number; // Cost per mille
}

interface Sponsor {
  id: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  sponsorshipType: 'event' | 'society' | 'platform';
  sponsorshipLevel: 'platinum' | 'gold' | 'silver' | 'bronze';
  amount: number;
  startDate: string;
  endDate: string;
  status: 'active' | 'pending' | 'expired' | 'cancelled';
  benefits: string[];
  eventsSponsored: number;
}

interface Campaign {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  budget: number;
  spent: number;
  targetAudience: string;
  status: 'active' | 'paused' | 'completed' | 'draft';
  ads: string[];
  performance: {
    impressions: number;
    clicks: number;
    conversions: number;
    ctr: number;
    cpc: number;
  };
}

interface WebsiteAd {
  id: string;
  title: string;
  advertiser: string;
  adSection: string;
  adType: string;
  imageUrl: string;
  redirectUrl: string;
  startDate: string;
  endDate: string;
  status: 'active' | 'paused' | 'completed' | 'draft';
  priority: number;
  impressions: number;
  clicks: number;
  created_at?: string;
  updated_at?: string;
}

export const AdsSponsors: React.FC = () => {
  const navigate = useNavigate();
  const { sponsors, loading: sponsorsLoading, refetch: refetchSponsors } = useSponsors();
  const { advertisements, loading: adsLoading, error: adsError, refetch: refetchAds } = useAdvertisements({ skipOrgFilter: true });
  const { campaigns, loading: campaignsLoading, error: campaignsError, refetch: refetchCampaigns } = useCampaigns({ skipOrgFilter: true });
  const { websiteAds, loading: websiteAdsLoading, error: websiteAdsError, refetch: refetchWebsiteAds } = useWebsiteAds({ skipOrgFilter: true });
  const [activeTab, setActiveTab] = useState<'campaigns' | 'ads' | 'website_ads' | 'sponsors'>('campaigns');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showWebsiteAdModal, setShowWebsiteAdModal] = useState(false);
  const [isEditingWebsiteAd, setIsEditingWebsiteAd] = useState(false);
  const [websiteAdSectionFilter, setWebsiteAdSectionFilter] = useState('all');
  const [websiteAdForm, setWebsiteAdForm] = useState<Partial<WebsiteAd>>({
    title: '',
    advertiser: 'Website',
    adSection: 'homepage_hero',
    adType: 'banner',
    imageUrl: '',
    redirectUrl: '',
    startDate: '',
    endDate: '',
    status: 'draft',
    priority: 0,
  });

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'active': return 'success';
      case 'paused': case 'pending': return 'warning';
      case 'completed': return 'info';
      case 'expired': case 'cancelled': return 'error';
      default: return 'default';
    }
  };

  const getLevelVariant = (level: string) => {
    switch (level) {
      case 'platinum': return 'error';
      case 'gold': return 'warning';
      case 'silver': return 'default';
      case 'bronze': return 'info';
      default: return 'default';
    }
  };

  const totalAdSpend = advertisements.reduce((sum, ad) => sum + ad.spent, 0);
  const totalSponsorRevenue = sponsors.reduce((sum, sponsor) => sum + sponsor.amount, 0);
  const totalImpressions = advertisements.reduce((sum, ad) => sum + ad.impressions, 0);
  const totalClicks = advertisements.reduce((sum, ad) => sum + ad.clicks, 0);
  const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions * 100) : 0;

  const handleViewDetails = (item: any) => {
    setSelectedItem(item);
    setShowDetailModal(true);
  };

  const openAddWebsiteAd = () => {
    setIsEditingWebsiteAd(false);
    setWebsiteAdForm({
      title: '',
      advertiser: 'Website',
      adSection: 'homepage_hero',
      adType: 'banner',
      imageUrl: '',
      redirectUrl: '',
      startDate: '',
      endDate: '',
      status: 'draft',
      priority: 0,
    });
    setShowWebsiteAdModal(true);
  };

  const openEditWebsiteAd = (ad: WebsiteAd) => {
    setIsEditingWebsiteAd(true);
    setWebsiteAdForm({ ...ad });
    setShowWebsiteAdModal(true);
  };

  const saveWebsiteAd = async () => {
    if (!websiteAdForm.title?.trim() || !websiteAdForm.adSection?.trim()) {
      alert('Title and Ad Section are required.');
      return;
    }

    const status = websiteAdForm.status || 'draft';
    const mediaUrl = websiteAdForm.imageUrl?.trim() || '';
    if (!mediaUrl) {
      alert('Image URL is required for website ads.');
      return;
    }

    const payload = {
      title: websiteAdForm.title.trim(),
      advertiser: websiteAdForm.advertiser?.trim() || 'Website',
      section_key: websiteAdForm.adSection.trim(),
      media_type: websiteAdForm.adType || 'image',
      media_url: mediaUrl,
      cta_url: websiteAdForm.redirectUrl?.trim() || null,
      start_date: websiteAdForm.startDate || null,
      end_date: websiteAdForm.endDate || null,
      status,
      sort_order: Number(websiteAdForm.priority || 0),
      is_active: status === 'active' || status === 'published',
    };

    if (isEditingWebsiteAd && websiteAdForm.id) {
      const { error } = await apiClient
        .from('website_ads')
        .update(payload)
        .eq('id', websiteAdForm.id);
      if (error) {
        alert(error.message);
        return;
      }
    } else {
      const { error } = await apiClient
        .from('website_ads')
        .insert(payload);
      if (error) {
        alert(error.message);
        return;
      }
    }

    setShowWebsiteAdModal(false);
    refetchWebsiteAds();
  };

  const deleteWebsiteAd = async (id: string) => {
    if (!window.confirm('Delete this website ad?')) {
      return;
    }
    const { data, error } = await apiClient
      .from('website_ads')
      .delete()
      .eq('id', id)
      .select('id');
    if (error) {
      alert(error.message);
      return;
    }
    if (!data || data.length === 0) {
      alert('Delete was blocked by database permissions. Please run latest Supabase migrations and try again.');
      return;
    }
    refetchWebsiteAds();
  };

  const handleExport = () => {
    let ok = false;

    switch (activeTab) {
      case 'campaigns':
        ok = downloadCsv(
          csvFilename('campaigns-export'),
          [
            'Name',
            'Description',
            'Start Date',
            'End Date',
            'Budget',
            'Spent',
            'Status',
            'Target Audience',
            'Impressions',
            'Clicks',
            'CTR %',
            'CPC',
          ],
          campaigns.map((campaign) => [
            campaign.name,
            campaign.description,
            campaign.startDate,
            campaign.endDate,
            campaign.budget,
            campaign.spent,
            campaign.status,
            campaign.targetAudience,
            campaign.performance.impressions,
            campaign.performance.clicks,
            campaign.performance.ctr,
            campaign.performance.cpc,
          ]),
        );
        break;
      case 'ads':
        ok = downloadCsv(
          csvFilename('advertisements-export'),
          [
            'Title',
            'Advertiser',
            'Type',
            'Placement',
            'Start Date',
            'End Date',
            'Budget',
            'Spent',
            'Impressions',
            'Clicks',
            'CTR %',
            'CPM',
            'Status',
          ],
          advertisements.map((ad) => [
            ad.title,
            ad.advertiser,
            ad.type,
            ad.placement,
            ad.startDate,
            ad.endDate,
            ad.budget,
            ad.spent,
            ad.impressions,
            ad.clicks,
            ad.ctr,
            ad.cpm,
            ad.status,
          ]),
        );
        break;
      case 'website_ads':
        ok = downloadCsv(
          csvFilename('website-ads-export'),
          [
            'Title',
            'Advertiser',
            'Section',
            'Type',
            'Start Date',
            'End Date',
            'Priority',
            'Impressions',
            'Clicks',
            'Status',
            'Redirect URL',
          ],
          websiteAds.map((ad) => [
            ad.title,
            ad.advertiser,
            ad.adSection,
            ad.adType,
            ad.startDate,
            ad.endDate,
            ad.priority,
            ad.impressions,
            ad.clicks,
            ad.status,
            ad.redirectUrl,
          ]),
        );
        break;
      default:
        ok = downloadCsv(
          csvFilename('sponsors-export'),
          [
            'Company',
            'Contact Person',
            'Email',
            'Phone',
            'Type',
            'Level',
            'Amount',
            'Start Date',
            'End Date',
            'Events Sponsored',
            'Status',
            'Benefits',
          ],
          sponsors.map((sponsor) => [
            sponsor.companyName,
            sponsor.contactPerson,
            sponsor.email,
            sponsor.phone,
            sponsor.sponsorshipType,
            sponsor.sponsorshipLevel,
            sponsor.amount,
            sponsor.startDate,
            sponsor.endDate,
            sponsor.eventsSponsored,
            sponsor.status,
            sponsor.benefits.join('; '),
          ]),
        );
    }

    if (!ok) {
      window.alert('No data available to export for the current tab.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Ads & Sponsors</h1>
          <p className="text-gray-600">Manage advertisements, sponsorships, and marketing campaigns</p>
        </div>
        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3">
          <Button
            variant="outline"
            className="flex items-center space-x-2 w-full sm:w-auto justify-center"
            onClick={handleExport}
          >
            <Download className="h-4 w-4" />
            <span>Export Report</span>
          </Button>
          <Link to="/ads-sponsors/campaigns/create">
            <Button className="flex items-center space-x-2 w-full sm:w-auto justify-center">
              <Plus className="h-4 w-4" />
              <span>New Campaign</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-3 bg-green-100 rounded-full">
                <DollarSign className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Ad Revenue</p>
                <p className="text-2xl font-bold text-gray-900">₹{totalAdSpend.toLocaleString()}</p>
                <div className="flex items-center mt-1">
                  <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
                  <span className="text-sm text-green-600">+15.2%</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-3 bg-blue-100 rounded-full">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Sponsor Revenue</p>
                <p className="text-2xl font-bold text-gray-900">₹{(totalSponsorRevenue / 100000).toFixed(1)}L</p>
                <p className="text-sm text-gray-500">{sponsors.filter(s => s.status === 'active').length} active</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-3 bg-purple-100 rounded-full">
                <Eye className="h-6 w-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Impressions</p>
                <p className="text-2xl font-bold text-gray-900">{(totalImpressions / 1000).toFixed(0)}K</p>
                <p className="text-sm text-gray-500">This month</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-3 bg-yellow-100 rounded-full">
                <MousePointer className="h-6 w-6 text-yellow-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Clicks</p>
                <p className="text-2xl font-bold text-gray-900">{totalClicks.toLocaleString()}</p>
                <p className="text-sm text-gray-500">This month</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-3 bg-red-100 rounded-full">
                <Target className="h-6 w-6 text-red-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Avg CTR</p>
                <p className="text-2xl font-bold text-gray-900">{avgCTR.toFixed(1)}%</p>
                <p className="text-sm text-gray-500">Click-through rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'campaigns', label: 'Campaigns', count: campaigns.length },
            { id: 'ads', label: 'Advertisements', count: advertisements.length },
            { id: 'website_ads', label: 'Website Ads', count: websiteAds.length },
            { id: 'sponsors', label: 'Sponsors', count: sponsors.length }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
              <span className="ml-2 bg-gray-100 text-gray-600 py-0.5 px-2 rounded-full text-xs">
                {tab.count}
              </span>
            </button>
          ))}
        </nav>
      </div>

      {/* Campaigns Tab */}
      {activeTab === 'campaigns' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900">Marketing Campaigns</h3>
            <Link to="/ads-sponsors/campaigns/create">
              <Button className="flex items-center space-x-2">
                <Plus className="h-4 w-4" />
                <span>Create Campaign</span>
              </Button>
            </Link>
          </div>
          {campaignsError && (
            <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
              {campaignsError}
            </div>
          )}
          {campaignsLoading ? (
            <p className="text-gray-500 py-4">Loading campaigns…</p>
          ) : (
          campaigns.map((campaign) => (
            <Card key={campaign.id}>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{campaign.name}</h3>
                    <p className="text-gray-600">{campaign.description}</p>
                  </div>
                  <Badge variant={getStatusVariant(campaign.status)}>
                    {campaign.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Budget</h4>
                    <div className="text-2xl font-bold text-gray-900">₹{campaign.budget.toLocaleString()}</div>
                    <div className="text-sm text-gray-500">Spent: ₹{campaign.spent.toLocaleString()}</div>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full"
                        style={{ width: `${(campaign.spent / campaign.budget) * 100}%` }}
                      ></div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Performance</h4>
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Impressions:</span>
                        <span className="font-medium">{campaign.performance.impressions.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Clicks:</span>
                        <span className="font-medium">{campaign.performance.clicks.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">CTR:</span>
                        <span className="font-medium">{campaign.performance.ctr}%</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Duration</h4>
                    <div className="text-sm">
                      <div>{new Date(campaign.startDate).toLocaleDateString()}</div>
                      <div className="text-gray-500">to {new Date(campaign.endDate).toLocaleDateString()}</div>
                    </div>
                    <div className="mt-2">
                      <span className="text-sm text-gray-600">Target: </span>
                      <span className="text-sm font-medium">{campaign.targetAudience}</span>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Actions</h4>
                    <div className="flex flex-col space-y-2">
                      <Button size="sm" variant="outline" onClick={() => handleViewDetails(campaign)}>
                        <BarChart3 className="h-4 w-4 mr-2" />
                        View Analytics
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => navigate(`/ads-sponsors/campaigns/${campaign.id}/edit`)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit Campaign
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
          )}
        </div>
      )}

      {/* Advertisements Tab */}
      {activeTab === 'ads' && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900">Active Advertisements</h3>
              <div className="flex space-x-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search ads..."
                    className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <Button size="sm" variant="outline">
                  <Filter className="h-4 w-4 mr-1" />
                  Filter
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {adsError && (
              <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm mb-4">
                {adsError}
              </div>
            )}
            {adsLoading ? (
              <p className="text-gray-500 py-4">Loading advertisements…</p>
            ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Advertisement</TableHead>
                  <TableHead>Type & Placement</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Budget</TableHead>
                  <TableHead>Performance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {advertisements.map((ad) => (
                  <TableRow key={ad.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium text-gray-900">{ad.title}</div>
                        <div className="text-sm text-gray-500">{ad.advertiser}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Badge variant="default">{ad.type.replace('_', ' ')}</Badge>
                        <div className="text-sm text-gray-500">{ad.placement.replace('_', ' ')}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>{new Date(ad.startDate).toLocaleDateString()}</div>
                        <div className="text-gray-500">to {new Date(ad.endDate).toLocaleDateString()}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div className="font-medium">₹{ad.budget.toLocaleString()}</div>
                        <div className="text-gray-500">Spent: ₹{ad.spent.toLocaleString()}</div>
                        <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                          <div 
                            className="bg-blue-600 h-2 rounded-full"
                            style={{ width: `${(ad.spent / ad.budget) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>{ad.impressions.toLocaleString()} impressions</div>
                        <div>{ad.clicks.toLocaleString()} clicks</div>
                        <div className="text-gray-500">CTR: {ad.ctr}%</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(ad.status)}>
                        {ad.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex space-x-1">
                        <Button size="sm" variant="ghost" onClick={() => handleViewDetails(ad)} title="View">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => navigate(`/ads-sponsors/ads/${ad.id}/edit`)} title="Edit">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost">
                          {ad.status === 'active' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        </Button>
                        <Button size="sm" variant="ghost">
                          <BarChart3 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Website Ads Tab */}
      {activeTab === 'website_ads' && (
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h3 className="text-lg font-semibold text-gray-900">Website Ads</h3>
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={websiteAdSectionFilter}
                  onChange={(e) => setWebsiteAdSectionFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Sections</option>
                  <option value="homepage_hero">Homepage Hero</option>
                  <option value="homepage_sidebar">Homepage Sidebar</option>
                  <option value="events_top">Events Top</option>
                  <option value="events_sidebar">Events Sidebar</option>
                  <option value="footer_strip">Footer Strip</option>
                </select>
                <Button size="sm" onClick={openAddWebsiteAd} className="flex items-center space-x-2">
                  <Plus className="h-4 w-4" />
                  <span>Add Website Ad</span>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {websiteAdsError && (
              <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm mb-4">
                {websiteAdsError}
              </div>
            )}
            {websiteAdsLoading ? (
              <p className="text-gray-500 py-4">Loading website ads...</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ad</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Performance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {websiteAds
                    .filter((ad) => websiteAdSectionFilter === 'all' || ad.adSection === websiteAdSectionFilter)
                    .map((ad) => {
                      const ctr = ad.impressions > 0 ? (ad.clicks / ad.impressions) * 100 : 0;
                      return (
                        <TableRow key={ad.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium text-gray-900">{ad.title}</div>
                              <div className="text-sm text-gray-500">{ad.advertiser}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="default">{ad.adSection.replace(/_/g, ' ')}</Badge>
                          </TableCell>
                          <TableCell className="capitalize">{ad.adType.replace(/_/g, ' ')}</TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div>{ad.startDate ? new Date(ad.startDate).toLocaleDateString() : '-'}</div>
                              <div className="text-gray-500">to {ad.endDate ? new Date(ad.endDate).toLocaleDateString() : '-'}</div>
                            </div>
                          </TableCell>
                          <TableCell>{ad.priority}</TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div>{ad.impressions.toLocaleString()} impressions</div>
                              <div>{ad.clicks.toLocaleString()} clicks</div>
                              <div className="text-gray-500">CTR: {ctr.toFixed(2)}%</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={getStatusVariant(ad.status)}>{ad.status}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex space-x-1">
                              <Button size="sm" variant="ghost" onClick={() => handleViewDetails(ad)} title="View">
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => openEditWebsiteAd(ad)} title="Edit">
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => deleteWebsiteAd(ad.id)} title="Delete">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Sponsors Tab */}
      {activeTab === 'sponsors' && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900">Sponsor Partners</h3>
              <Link to="/ads-sponsors/sponsors/create">
                <Button size="sm" className="flex items-center space-x-2">
                  <Plus className="h-4 w-4" />
                  <span>Add Sponsor</span>
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Sponsorship</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Events</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sponsorsLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                      Loading sponsors…
                    </TableCell>
                  </TableRow>
                ) : sponsors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                      No sponsors yet. Add one using the button above.
                    </TableCell>
                  </TableRow>
                ) : (
                sponsors.map((sponsor) => (
                  <TableRow key={sponsor.id}>
                    <TableCell>
                      <div className="font-medium text-gray-900">{sponsor.companyName}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div className="font-medium">{sponsor.contactPerson}</div>
                        <div className="text-gray-500">{sponsor.email}</div>
                        <div className="text-gray-500">{sponsor.phone}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Badge variant={getLevelVariant(sponsor.sponsorshipLevel)}>
                          {sponsor.sponsorshipLevel}
                        </Badge>
                        <div className="text-sm text-gray-500 capitalize">
                          {sponsor.sponsorshipType.replace('_', ' ')}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">₹{sponsor.amount.toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>{new Date(sponsor.startDate).toLocaleDateString()}</div>
                        <div className="text-gray-500">to {new Date(sponsor.endDate).toLocaleDateString()}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        <Calendar className="h-4 w-4 mr-1 text-blue-500" />
                        <span className="font-medium">{sponsor.eventsSponsored}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(sponsor.status)}>
                        {sponsor.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex space-x-1">
                        <Button size="sm" variant="ghost" onClick={() => handleViewDetails(sponsor)} title="View">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => navigate(`/ads-sponsors/sponsors/${sponsor.id}/edit`)} title="Edit">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" title="External link">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900">
                  {selectedItem.title || selectedItem.companyName || selectedItem.name}
                </h2>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>
            </div>
            
            <div className="p-6">
              {selectedItem.adSection != null ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Website Ad Details</h3>
                    <dl className="space-y-3 text-sm">
                      <div>
                        <dt className="text-gray-500">Title</dt>
                        <dd className="font-medium text-gray-900">{selectedItem.title}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Advertiser</dt>
                        <dd className="text-gray-900">{selectedItem.advertiser || 'Website'}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Section / Type</dt>
                        <dd className="text-gray-900 capitalize">{String(selectedItem.adSection).replace(/_/g, ' ')} / {String(selectedItem.adType).replace(/_/g, ' ')}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Redirect URL</dt>
                        <dd className="text-gray-900 break-all">{selectedItem.redirectUrl || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Period</dt>
                        <dd className="text-gray-900">
                          {selectedItem.startDate && new Date(selectedItem.startDate).toLocaleDateString()} – {selectedItem.endDate && new Date(selectedItem.endDate).toLocaleDateString()}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Priority</dt>
                        <dd className="text-gray-900">{selectedItem.priority ?? 0}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Status</dt>
                        <dd><Badge variant={getStatusVariant(selectedItem.status)}>{selectedItem.status}</Badge></dd>
                      </div>
                    </dl>
                    <Button variant="outline" size="sm" className="mt-4" onClick={() => { setShowDetailModal(false); openEditWebsiteAd(selectedItem); }}>
                      <Edit className="h-4 w-4 mr-2" />
                      Edit Website Ad
                    </Button>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance</h3>
                    <dl className="space-y-2 text-sm">
                      <div className="flex justify-between"><dt className="text-gray-500">Impressions</dt><dd className="font-medium text-gray-900">{selectedItem.impressions?.toLocaleString?.() ?? 0}</dd></div>
                      <div className="flex justify-between"><dt className="text-gray-500">Clicks</dt><dd className="font-medium text-gray-900">{selectedItem.clicks?.toLocaleString?.() ?? 0}</dd></div>
                      <div className="flex justify-between"><dt className="text-gray-500">CTR</dt><dd className="font-medium text-gray-900">{selectedItem.impressions > 0 ? ((selectedItem.clicks / selectedItem.impressions) * 100).toFixed(2) : 0}%</dd></div>
                    </dl>
                    {selectedItem.imageUrl && (
                      <div className="mt-4">
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Creative Preview</h4>
                        <img src={selectedItem.imageUrl} alt={selectedItem.title} className="w-full h-48 object-cover rounded-lg border border-gray-200" />
                      </div>
                    )}
                  </div>
                </div>
              ) : selectedItem.advertiser != null ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Advertisement Details</h3>
                    <dl className="space-y-3 text-sm">
                      <div>
                        <dt className="text-gray-500">Title</dt>
                        <dd className="font-medium text-gray-900">{selectedItem.title}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Advertiser</dt>
                        <dd className="text-gray-900">{selectedItem.advertiser}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Type / Placement</dt>
                        <dd className="text-gray-900 capitalize">{String(selectedItem.type).replace('_', ' ')} / {String(selectedItem.placement).replace('_', ' ')}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Period</dt>
                        <dd className="text-gray-900">
                          {selectedItem.startDate && new Date(selectedItem.startDate).toLocaleDateString()} – {selectedItem.endDate && new Date(selectedItem.endDate).toLocaleDateString()}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Budget / Spent</dt>
                        <dd className="text-gray-900">₹{selectedItem.budget?.toLocaleString?.() ?? '0'} / ₹{selectedItem.spent?.toLocaleString?.() ?? '0'}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Status</dt>
                        <dd><Badge variant={getStatusVariant(selectedItem.status)}>{selectedItem.status}</Badge></dd>
                      </div>
                    </dl>
                    <Button variant="outline" size="sm" className="mt-4" onClick={() => { setShowDetailModal(false); navigate(`/ads-sponsors/ads/${selectedItem.id}/edit`); }}>
                      <Edit className="h-4 w-4 mr-2" />
                      Edit Advertisement
                    </Button>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance</h3>
                    <dl className="space-y-2 text-sm">
                      <div className="flex justify-between"><dt className="text-gray-500">Impressions</dt><dd className="font-medium text-gray-900">{selectedItem.impressions?.toLocaleString?.() ?? 0}</dd></div>
                      <div className="flex justify-between"><dt className="text-gray-500">Clicks</dt><dd className="font-medium text-gray-900">{selectedItem.clicks?.toLocaleString?.() ?? 0}</dd></div>
                      <div className="flex justify-between"><dt className="text-gray-500">CTR</dt><dd className="font-medium text-gray-900">{selectedItem.ctr ?? 0}%</dd></div>
                      <div className="flex justify-between"><dt className="text-gray-500">CPM</dt><dd className="font-medium text-gray-900">{selectedItem.cpm ?? 0}</dd></div>
                    </dl>
                  </div>
                </div>
              ) : selectedItem.companyName != null ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Sponsor Details</h3>
                    <dl className="space-y-3 text-sm">
                      <div>
                        <dt className="text-gray-500">Company</dt>
                        <dd className="font-medium text-gray-900">{selectedItem.companyName}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Contact</dt>
                        <dd className="text-gray-900">{selectedItem.contactPerson}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Email</dt>
                        <dd className="text-gray-900">{selectedItem.email}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Phone</dt>
                        <dd className="text-gray-900">{selectedItem.phone || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Type / Level</dt>
                        <dd className="text-gray-900 capitalize">{selectedItem.sponsorshipType} / {selectedItem.sponsorshipLevel}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Amount</dt>
                        <dd className="text-gray-900">₹{selectedItem.amount?.toLocaleString?.() ?? '0'}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Period</dt>
                        <dd className="text-gray-900">
                          {selectedItem.startDate && new Date(selectedItem.startDate).toLocaleDateString()} – {selectedItem.endDate && new Date(selectedItem.endDate).toLocaleDateString()}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Status</dt>
                        <dd><Badge variant={selectedItem.status === 'active' ? 'success' : selectedItem.status === 'expired' || selectedItem.status === 'cancelled' ? 'error' : 'warning'}>{selectedItem.status}</Badge></dd>
                      </div>
                      {Array.isArray(selectedItem.benefits) && selectedItem.benefits.length > 0 && (
                        <div>
                          <dt className="text-gray-500 mb-1">Benefits</dt>
                          <dd className="text-gray-900"><ul className="list-disc pl-4">{selectedItem.benefits.map((b: string, i: number) => <li key={i}>{b}</li>)}</ul></dd>
                        </div>
                      )}
                    </dl>
                    <Button variant="outline" size="sm" className="mt-4" onClick={() => { setShowDetailModal(false); navigate(`/ads-sponsors/sponsors/${selectedItem.id}/edit`); }}>
                      <Edit className="h-4 w-4 mr-2" />
                      Edit Sponsor
                    </Button>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Summary</h3>
                    <p className="text-sm text-gray-600">Events sponsored: <span className="font-medium text-gray-900">{selectedItem.eventsSponsored ?? 0}</span></p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Details</h3>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance</h3>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Website Ad Add/Edit Modal */}
      {showWebsiteAdModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900">
                  {isEditingWebsiteAd ? 'Edit Website Ad' : 'Add Website Ad'}
                </h2>
                <button
                  onClick={() => setShowWebsiteAdModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input className="w-full px-3 py-2 border border-gray-300 rounded-lg" value={websiteAdForm.title || ''} onChange={(e) => setWebsiteAdForm((p) => ({ ...p, title: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Advertiser</label>
                <input className="w-full px-3 py-2 border border-gray-300 rounded-lg" value={websiteAdForm.advertiser || ''} onChange={(e) => setWebsiteAdForm((p) => ({ ...p, advertiser: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ad Section *</label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-lg" value={websiteAdForm.adSection || 'homepage_hero'} onChange={(e) => setWebsiteAdForm((p) => ({ ...p, adSection: e.target.value }))}>
                  <option value="homepage_hero">Homepage Hero</option>
                  <option value="homepage_sidebar">Homepage Sidebar</option>
                  <option value="events_top">Events Top</option>
                  <option value="events_sidebar">Events Sidebar</option>
                  <option value="footer_strip">Footer Strip</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ad Type</label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-lg" value={websiteAdForm.adType || 'banner'} onChange={(e) => setWebsiteAdForm((p) => ({ ...p, adType: e.target.value }))}>
                  <option value="banner">Banner</option>
                  <option value="popup">Popup</option>
                  <option value="video">Video</option>
                  <option value="native">Native</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
                <input className="w-full px-3 py-2 border border-gray-300 rounded-lg" value={websiteAdForm.imageUrl || ''} onChange={(e) => setWebsiteAdForm((p) => ({ ...p, imageUrl: e.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Redirect URL</label>
                <input className="w-full px-3 py-2 border border-gray-300 rounded-lg" value={websiteAdForm.redirectUrl || ''} onChange={(e) => setWebsiteAdForm((p) => ({ ...p, redirectUrl: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input type="date" className="w-full px-3 py-2 border border-gray-300 rounded-lg" value={websiteAdForm.startDate || ''} onChange={(e) => setWebsiteAdForm((p) => ({ ...p, startDate: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input type="date" className="w-full px-3 py-2 border border-gray-300 rounded-lg" value={websiteAdForm.endDate || ''} onChange={(e) => setWebsiteAdForm((p) => ({ ...p, endDate: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-lg" value={websiteAdForm.status || 'draft'} onChange={(e) => setWebsiteAdForm((p) => ({ ...p, status: e.target.value as WebsiteAd['status'] }))}>
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <input type="number" className="w-full px-3 py-2 border border-gray-300 rounded-lg" value={websiteAdForm.priority ?? 0} onChange={(e) => setWebsiteAdForm((p) => ({ ...p, priority: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowWebsiteAdModal(false)}>Cancel</Button>
              <Button onClick={saveWebsiteAd}>{isEditingWebsiteAd ? 'Update Ad' : 'Create Ad'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};