import React, { useState, useRef, useEffect } from "react";
import MissionPickupTable from "./common/MissionPickupTable";
import Modal from "./common/Modal";
import html2pdf from "html2pdf.js";
import MissionColisScan from "./MissionColisScan";
import ChefAgenceMissionScan from "./ChefAgenceMissionScan";

import { missionsPickupService } from '../../services/api';
import { apiService } from '../../services/api';

// Pickup mission status flow
const pickupStatusList = [
  "En attente",      // Initial status when pickup is created
  "À enlever",       // When driver accepts the mission  
  "Enlevé",          // When driver scans parcel codes
  "Au dépôt",        // When driver completes with security code
  "Terminé"          // When mission is completed with completion code
];

const statusBadge = (status) => {
  const colorMap = {
    "En attente": "bg-yellow-100 text-yellow-800 border-yellow-300",
    "À enlever": "bg-blue-100 text-blue-800 border-blue-300", 
    "Enlevé": "bg-green-100 text-green-800 border-green-300",
    "Au dépôt": "bg-purple-100 text-purple-800 border-purple-300",
    "Terminé": "bg-emerald-100 text-emerald-800 border-emerald-300",
    "En cours": "bg-purple-100 text-purple-800 border-purple-300",
    "RTN dépot": "bg-orange-100 text-orange-800 border-orange-300",
    "Livrés": "bg-green-100 text-green-800 border-green-300",
    "Livrés payés": "bg-emerald-100 text-emerald-800 border-emerald-300",
    "Terminé": "bg-emerald-100 text-emerald-800 border-emerald-300",
    "Retour définitif": "bg-red-100 text-red-800 border-red-300",
    "RTN client dépôt": "bg-pink-100 text-pink-800 border-pink-300",
    "Retour Expéditeur": "bg-gray-100 text-gray-800 border-gray-300",
    "Retour En Cours d'expédition": "bg-indigo-100 text-indigo-800 border-indigo-300",
    "Retour reçu": "bg-cyan-100 text-cyan-800 border-cyan-300",
  };
  return <span className={`inline-block px-3 py-1 rounded-full border text-xs font-semibold ${colorMap[status] || "bg-gray-100 text-gray-800 border-gray-300"}`}>{status}</span>;
};

const Pickup = () => {
  const [missions, setMissions] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [acceptedMissions, setAcceptedMissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewMission, setViewMission] = useState(null);
  const detailRef = useRef();
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [scannedColis, setScannedColis] = useState([]);
  const [securityCodes, setSecurityCodes] = useState({});
  
  // Scanning state for pickup missions
  const [isPickupScanModalOpen, setIsPickupScanModalOpen] = useState(false);
  const [scannedParcels, setScannedParcels] = useState([]);
  const [scanInput, setScanInput] = useState("");
  const [scanningMission, setScanningMission] = useState(null);
  
  // Chef d'agence scanning state
  const [isChefAgenceScanModalOpen, setIsChefAgenceScanModalOpen] = useState(false);
  const [chefAgenceScanningMission, setChefAgenceScanningMission] = useState(null);

  // Step-by-step wizard state for new logic
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [selectedMissions, setSelectedMissions] = useState([]);
  const [agencyFilter, setAgencyFilter] = useState("");
  const [filteredDrivers, setFilteredDrivers] = useState([]);
  const [filteredAcceptedMissions, setFilteredAcceptedMissions] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  
  // Dashboard stats state
  const [stats, setStats] = useState({
    totalMissions: 0,
    pendingMissions: 0,
    completedMissions: 0,
    rejectedMissions: 0
  });
  
  // Dashboard filter state
  const [statusFilter, setStatusFilter] = useState(null);

  // Load data from API
  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      setError(null);
      try {
        // Get current user from localStorage
        const user = JSON.parse(localStorage.getItem('currentUser') || 'null');
        setCurrentUser(user);

        console.log('Fetching pickup missions data...');
        const [missionsData, driversData, acceptedDemandsData] = await Promise.all([
          missionsPickupService.getMissionsPickup(),
          apiService.getDrivers(),
          apiService.getAcceptedMissions(true), // This gets demands with "Accepted" status, excluding those already in missions
        ]);
        
        console.log('🔍 Accepted demands (filtered to exclude those already in missions):', acceptedDemandsData);
        
        console.log('Missions data:', missionsData);
        console.log('Drivers data:', driversData);
        console.log('Accepted demands data:', acceptedDemandsData);
        console.log('Current user:', user);
        
        // Debug: Check each demand's agency
        if (acceptedDemandsData && acceptedDemandsData.length > 0) {
          console.log('🔍 Debug - Accepted demands agencies:');
          acceptedDemandsData.forEach((demand, index) => {
            console.log(`Demand ${index + 1}:`, {
              id: demand.id,
              expediteur_name: demand.expediteur_name,
              expediteur_agency: demand.expediteur_agency,
              status: demand.status
            });
          });
        }
        
        const missions = missionsData?.data || missionsData || [];
        setMissions(missions);
        setDrivers(driversData);
        setAcceptedMissions(acceptedDemandsData || []);
        
        // Calculate dashboard stats
        calculateStats(missions);
        
        // Initialize filtered drivers based on user role
        filterDriversByRole(driversData, user);
        
        // Fetch security codes for all missions
        console.log('Fetching security codes for all missions...');
        const codes = {};
        for (const mission of missions) {
          try {
            const codeResponse = await missionsPickupService.getMissionSecurityCode(mission.id);
            console.log('🔐 Security code response for mission', mission.id, ':', codeResponse);
            
            if (codeResponse.success && codeResponse.data && codeResponse.data.security_code) {
              codes[mission.id] = codeResponse.data.security_code;
            } else if (codeResponse.data && codeResponse.data.securityCode) {
              codes[mission.id] = codeResponse.data.securityCode;
            } else if (codeResponse.security_code) {
              codes[mission.id] = codeResponse.security_code;
            } else if (codeResponse.securityCode) {
              codes[mission.id] = codeResponse.securityCode;
            }
          } catch (error) {
            console.error(`Error fetching security code for mission ${mission.id}:`, error);
          }
        }
        console.log('🔐 Final security codes:', codes);
        setSecurityCodes(codes);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError("Erreur lors du chargement des données.");
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  // Recalculate stats whenever missions change
  useEffect(() => {
    if (missions.length > 0) {
      calculateStats(missions);
    }
  }, [missions]);

  // Filter drivers based on user role and agency
  const filterDriversByRole = (driversData, user) => {
    if (!user) {
      setFilteredDrivers(driversData);
      return;
    }

    if (user.role === 'Admin' || user.role === 'Administration') {
      // Admin sees all drivers
      setFilteredDrivers(driversData);
    } else if (user.role === 'Chef d\'agence' || user.role === 'Membre de l\'agence') {
      // Chef/Membre d'agence see only drivers in their agency
      const userAgency = user.agency || user.governorate;
      const filtered = driversData.filter(driver => 
        (driver.agency || driver.governorate || "").toLowerCase() === userAgency?.toLowerCase()
      );
      setFilteredDrivers(filtered);
    } else {
      setFilteredDrivers(driversData);
    }
  };

  // Filter accepted missions based on user role and agency
  const filterAcceptedMissionsByRole = (missionsData, user) => {
    if (!user) {
      setFilteredAcceptedMissions(missionsData);
      return;
    }

    if (user.role === 'Admin' || user.role === 'Administration') {
      // Admin sees all accepted missions
      setFilteredAcceptedMissions(missionsData);
    } else if (user.role === 'Chef d\'agence' || user.role === 'Membre de l\'agence') {
      // Chef/Membre d'agence see only missions in their agency
      const userAgency = user.agency || user.governorate;
      const filtered = missionsData.filter(mission => 
        (mission.expediteur_agency || "").toLowerCase() === userAgency?.toLowerCase()
      );
      setFilteredAcceptedMissions(filtered);
    } else {
      setFilteredAcceptedMissions(missionsData);
    }
  };

  // Calculate dashboard statistics
  const calculateStats = (missionsData) => {
    if (!missionsData || missionsData.length === 0) {
      setStats({
        totalMissions: 0,
        pendingMissions: 0,
        completedMissions: 0,
        rejectedMissions: 0
      });
      return;
    }

    const total = missionsData.length;
    const pending = missionsData.filter(m => m.status === 'En attente').length;
    const completed = missionsData.filter(m => m.status === 'Terminé').length;
    const rejected = missionsData.filter(m => m.status === 'Refusé par livreur').length;

    console.log('📊 Dashboard stats calculated:', {
      total,
      pending,
      completed,
      rejected,
      allStatuses: missionsData.map(m => m.status)
    });

    setStats({
      totalMissions: total,
      pendingMissions: pending,
      completedMissions: completed,
      rejectedMissions: rejected
    });
  };

  // Handle dashboard card clicks
  const handleDashboardCardClick = (status) => {
    if (statusFilter === status) {
      // If clicking the same card, clear the filter
      setStatusFilter(null);
    } else {
      // Set the new filter
      setStatusFilter(status);
    }
  };

  // Get filtered missions based on status filter
  const getFilteredMissions = () => {
    if (!statusFilter) {
      return missions;
    }
    return missions.filter(mission => mission.status === statusFilter);
  };

  // Wizard helper functions
  const handleDriverSelection = (driver) => {
    console.log('🔍 Driver selected:', driver);
    console.log('🔍 Current user:', currentUser);
    console.log('🔍 All accepted demands:', acceptedMissions);
    
    setSelectedDriver(driver);
    
    // Filter accepted demands based on driver's agency and user role
    let filteredDemands = acceptedMissions;
    
    if (currentUser?.role === 'Admin' || currentUser?.role === 'Administration') {
      // Admin sees all accepted demands that match the driver's agency
      const driverAgency = driver.agency || driver.governorate;
      console.log('🔍 Admin filtering - Driver agency:', driverAgency);
      console.log('🔍 All accepted demands before filtering:', acceptedMissions);
      
      filteredDemands = acceptedMissions.filter(demand => {
        const demandAgency = demand.expediteur_agency || "";
        const matches = demandAgency.toLowerCase() === driverAgency?.toLowerCase();
        console.log(`🔍 Demand ${demand.id}: agency="${demandAgency}" matches driver agency="${driverAgency}" = ${matches}`);
        
        // Also check if demand agency contains driver agency (for cases like "Entrepôt Sousse" vs "Sousse")
        const containsMatch = demandAgency.toLowerCase().includes(driverAgency?.toLowerCase() || "");
        console.log(`🔍 Demand ${demand.id}: agency="${demandAgency}" contains driver agency="${driverAgency}" = ${containsMatch}`);
        
        return matches || containsMatch;
      });
    } else if (currentUser?.role === 'Chef d\'agence' || currentUser?.role === 'Membre de l\'agence') {
      // Chef/Membre d'agence see only demands in their agency that match the driver's agency
      const userAgency = currentUser.agency || currentUser.governorate;
      const driverAgency = driver.agency || driver.governorate;
      console.log('🔍 Chef/Membre filtering - User agency:', userAgency, 'Driver agency:', driverAgency);
      
      filteredDemands = acceptedMissions.filter(demand => {
        const demandAgency = demand.expediteur_agency || "";
        const matchesUser = demandAgency.toLowerCase() === userAgency?.toLowerCase();
        const matchesDriver = demandAgency.toLowerCase() === driverAgency?.toLowerCase();
        
        // Also check if demand agency contains driver agency
        const containsDriverMatch = demandAgency.toLowerCase().includes(driverAgency?.toLowerCase() || "");
        
        console.log(`🔍 Demand ${demand.id}: agency="${demandAgency}" matches user agency="${userAgency}" = ${matchesUser}, matches driver agency="${driverAgency}" = ${matchesDriver}, contains driver agency = ${containsDriverMatch}`);
        return matchesUser && (matchesDriver || containsDriverMatch);
      });
    }
    
    console.log('🔍 Filtered demands:', filteredDemands);
    setFilteredAcceptedMissions(filteredDemands);
    setSelectedMissions([]);
  };

  const handleMissionSelection = async (mission) => {
    const isSelected = selectedMissions.find(m => m.id === mission.id);
    
    if (isSelected) {
      // Remove mission
      setSelectedMissions(prev => prev.filter(m => m.id !== mission.id));
    } else {
      // Add mission and fetch parcel details
      try {
        console.log('🔍 Fetching parcels for demand:', mission.id);
        const parcelsResponse = await apiService.getParcelsByDemand(mission.id);
        const parcels = parcelsResponse?.data || parcelsResponse || [];
        console.log('📦 Parcels for demand:', mission.id, parcels);
        
        const missionWithParcels = {
          ...mission,
          parcels: parcels
        };
        
        setSelectedMissions(prev => [...prev, missionWithParcels]);
      } catch (error) {
        console.error(`Error fetching parcels for demand ${mission.id}:`, error);
        const missionWithEmptyParcels = {
          ...mission,
          parcels: []
        };
        setSelectedMissions(prev => [...prev, missionWithEmptyParcels]);
      }
    }
  };





  const filterDriversByAgency = (agency) => {
    setAgencyFilter(agency);
    if (agency) {
      const filtered = drivers.filter(driver => 
        (driver.agency || driver.governorate || "").toLowerCase().includes(agency.toLowerCase())
      );
      setFilteredDrivers(filtered);
    } else {
      filterDriversByRole(drivers, currentUser);
    }
  };

  const resetWizard = () => {
    setCurrentStep(1);
    setSelectedDriver(null);
    setSelectedMissions([]);
    setAgencyFilter("");
    filterDriversByRole(drivers, currentUser);
    setFilteredAcceptedMissions([]);
  };

  // Actions
  const handleAdd = () => {
    resetWizard();
    setIsModalOpen(true);
  };

  const handleDelete = async (mission) => {
    if (window.confirm("Supprimer cette mission ?")) {
      try {
        await missionsPickupService.deleteMissionPickup(mission.id);
        const updatedMissions = missions.filter(m => m.id !== mission.id);
        setMissions(updatedMissions);
        // Recalculate stats
        calculateStats(updatedMissions);
      } catch (err) {
        alert("Erreur lors de la suppression de la mission.");
      }
    }
  };

  const handleSubmit = async () => {
    try {
      console.log('handleSubmit called with selected data:', {
        driver: selectedDriver,
        missions: selectedMissions
      });
      
      if (!selectedDriver || selectedMissions.length === 0) {
        alert("Veuillez sélectionner un livreur et au moins une mission.");
        return;
      }
      
      // Create pickup mission with selected missions
      const data = {
        livreur_id: selectedDriver.id,
        demand_ids: selectedMissions.map(m => m.id),
        notes: `Mission créée par ${currentUser?.name || `${currentUser?.firstName} ${currentUser?.lastName}`} (${currentUser?.role})`
      };
      
      console.log('🔍 Data being sent to backend:', JSON.stringify(data, null, 2));
      
      console.log('Creating pickup mission:', data);
      
      const response = await missionsPickupService.createMissionPickup(data);
      console.log('Pickup mission created:', response);
      
      // Add to missions list with full details
      const createdMission = response.data || response;
      
      // Get the full mission details with driver info
      try {
        const fullMissionResponse = await missionsPickupService.getMissionPickup(createdMission.id);
        const fullMission = fullMissionResponse.data || fullMissionResponse;
        const updatedMissions = [fullMission, ...missions];
        setMissions(updatedMissions);
        // Recalculate stats
        calculateStats(updatedMissions);
      } catch (error) {
        console.error('Error fetching full mission details:', error);
        // Fallback to the basic mission data
        const updatedMissions = [createdMission, ...missions];
        setMissions(updatedMissions);
        // Recalculate stats
        calculateStats(updatedMissions);
      }
      
      // Show success message with mission code
      alert(`Mission créée avec succès!\nCode de mission: ${createdMission.mission_number}`);
      
      console.log('Closing modal...');
      setIsModalOpen(false);
      resetWizard();
      console.log('Pickup mission creation completed successfully!');
    } catch (err) {
      console.error('❌ Error in handleSubmit:', err);
      console.error('❌ Error name:', err.name);
      console.error('❌ Error message:', err.message);
      console.error('❌ Error response data:', err.response?.data);
      console.error('❌ Error response status:', err.response?.status);
      
      let errorMessage = "Erreur lors de l'enregistrement de la mission";
      
      if (err.response?.data?.error) {
        errorMessage += `: ${err.response.data.error}`;
      } else if (err.response?.data?.message) {
        errorMessage += `: ${err.response.data.message}`;
      } else if (err.message) {
        errorMessage += `: ${err.message}`;
      }
      
      alert(errorMessage);
    }
  };

  const handleScanValidate = (codes) => {
    setIsScanModalOpen(false);
  };

  // Handle start scanning pickup mission
  const handleStartPickupScanning = async (mission) => {
    try {
      setScanningMission(mission);
      setScannedParcels([]);
      setScanInput("");
      setIsPickupScanModalOpen(true);
    } catch (error) {
      console.error('Error starting pickup scanning:', error);
      alert('Erreur lors du démarrage du scan');
    }
  };

  // Handle parcel scan for pickup mission
  const handlePickupParcelScan = async (trackingNumber) => {
    if (!trackingNumber.trim()) return;

    try {
      // Find the parcel in the mission
      const parcel = scanningMission.parcels?.find(p => 
        p.tracking_number === trackingNumber.trim() || p.id.toString() === trackingNumber.trim()
      );

      if (!parcel) {
        alert('Colis non trouvé dans cette mission');
        return;
      }

      // Check if already scanned
      if (scannedParcels.some(sp => sp.id === parcel.id)) {
        alert('Ce colis a déjà été scanné');
        return;
      }

      // Call backend to scan parcel
      await missionsPickupService.scanParcel(scanningMission.id, trackingNumber.trim());

      // Add to scanned parcels
      const newScannedParcel = {
        ...parcel,
        scanned_at: new Date().toISOString(),
        status: 'Au dépôt'
      };

      setScannedParcels(prev => [...prev, newScannedParcel]);
      setScanInput("");
      
      alert(`Colis ${trackingNumber} scanné avec succès`);

      // Check if all parcels are scanned
      const allParcelsScanned = scanningMission.parcels?.length === scannedParcels.length + 1;
      
      if (allParcelsScanned) {
        alert('Tous les colis scannés! Mission terminée.');
        setIsPickupScanModalOpen(false);
        // Refresh missions list
        const [missionsData] = await Promise.all([
          missionsPickupService.getMissionsPickup()
        ]);
        setMissions(missionsData?.data || missionsData || []);
      }

    } catch (error) {
      console.error('Error scanning parcel:', error);
      alert('Erreur lors du scan du colis');
    }
  };

  // Export PDF du détail de la mission
  const handleExportPDF = () => {
    if (detailRef.current) {
      html2pdf().set({
        margin: 0.5,
        filename: `Mission_${viewMission.id}.pdf`,
        html2canvas: { scale: 2 },
        jsPDF: { unit: "in", format: "a4", orientation: "portrait" }
      }).from(detailRef.current).save();
    }
  };

  // Chef d'agence scan parcel
  const handleChefAgenceScan = async (missionId, parcelId, barcode) => {
    try {
      console.log('🔍 Chef agence scanning parcel:', parcelId, 'barcode:', barcode);
      await apiService.chefAgenceScanParcel(missionId, parcelId);
      console.log('✅ Parcel scanned successfully by chef agence');
    } catch (error) {
      console.error('❌ Error in chef agence scan:', error);
      throw error; // Re-throw to let the component handle it
    }
  };

  // Chef d'agence generate completion code
  const handleChefAgenceGenerateCode = async (scannedParcels) => {
    try {
      console.log('🔍 Generating completion code for mission:', chefAgenceScanningMission.id);
      console.log('🔍 Scanned parcels:', scannedParcels);
      
      const response = await apiService.generateCompletionCode(chefAgenceScanningMission.id, scannedParcels);
      
      if (response.data?.success || response.success) {
        const completionCode = response.data?.completion_code || response.completion_code;
        alert(`Code de finalisation généré: ${completionCode}`);
        setIsChefAgenceScanModalOpen(false);
        fetchAll(); // Refresh data
      } else {
        const errorMessage = response.data?.message || response.message || 'Erreur lors de la génération du code';
        alert(errorMessage);
      }
    } catch (error) {
      console.error('❌ Error generating completion code:', error);
      console.error('❌ Error response:', error.response?.data);
      
      let errorMessage = 'Erreur lors de la génération du code de finalisation';
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      alert(errorMessage);
    }
  };

  // Start Chef d'agence scanning
  const handleStartChefAgenceScanning = async (mission) => {
    try {
      // Fetch full mission details with driver and demand information
      console.log('🔍 Fetching full mission details for Chef d\'agence scanning:', mission.id);
      const fullMissionResponse = await missionsPickupService.getMissionPickup(mission.id);
      console.log('🔍 Full mission response:', fullMissionResponse);
      
      // The response is already the data due to the API interceptor
      const fullMission = fullMissionResponse;
      console.log('🔍 Full mission details:', fullMission);
      
      setChefAgenceScanningMission(fullMission);
      setIsChefAgenceScanModalOpen(true);
    } catch (error) {
      console.error('❌ Error fetching full mission details:', error);
      // Fallback to basic mission data
      setChefAgenceScanningMission(mission);
      setIsChefAgenceScanModalOpen(true);
    }
  };



  if (loading) {
    return <div className="p-8 text-center text-gray-500">Chargement des missions...</div>;
  }
  if (error) {
    return <div className="p-8 text-center text-red-500">{error}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header harmonisé */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestion des missions de collecte</h1>
          <p className="text-gray-600 mt-1">Assignez des missions acceptées aux livreurs pour la collecte</p>
        </div>
        <button
          onClick={handleAdd}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
        >
          Nouvelle mission de collecte
        </button>
      </div>

      {/* Dashboard Stats - Only for Admin and Chef d'agence */}
      {(currentUser?.role === 'Admin' || currentUser?.role === 'Administration' || currentUser?.role === 'Chef d\'agence') && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Tableau de Bord - Missions de Collecte</h2>
            {statusFilter && (
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">Filtre actif:</span>
                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                  {statusFilter}
                </span>
                <button
                  onClick={() => setStatusFilter(null)}
                  className="text-gray-400 hover:text-gray-600 text-sm"
                  title="Effacer le filtre"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Total Missions */}
            <div 
              className={`border rounded-lg p-4 cursor-pointer transition-all duration-200 hover:scale-105 ${
                statusFilter === null 
                  ? 'bg-blue-100 border-blue-300 shadow-md' 
                  : 'bg-blue-50 border-blue-200 hover:bg-blue-100'
              }`}
              onClick={() => handleDashboardCardClick(null)}
            >
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-blue-600">Total Missions</p>
                  <p className="text-2xl font-bold text-blue-900">{stats.totalMissions}</p>
                </div>
              </div>
            </div>

            {/* Pending Missions */}
            <div 
              className={`border rounded-lg p-4 cursor-pointer transition-all duration-200 hover:scale-105 ${
                statusFilter === 'En attente' 
                  ? 'bg-yellow-100 border-yellow-300 shadow-md' 
                  : 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100'
              }`}
              onClick={() => handleDashboardCardClick('En attente')}
            >
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-yellow-600">En Attente</p>
                  <p className="text-2xl font-bold text-yellow-900">{stats.pendingMissions}</p>
                </div>
              </div>
            </div>

            {/* Completed Missions */}
            <div 
              className={`border rounded-lg p-4 cursor-pointer transition-all duration-200 hover:scale-105 ${
                statusFilter === 'Terminé' 
                  ? 'bg-green-100 border-green-300 shadow-md' 
                  : 'bg-green-50 border-green-200 hover:bg-green-100'
              }`}
              onClick={() => handleDashboardCardClick('Terminé')}
            >
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-green-600">Terminées</p>
                  <p className="text-2xl font-bold text-green-900">{stats.completedMissions}</p>
                </div>
              </div>
            </div>

            {/* Rejected Missions */}
            <div 
              className={`border rounded-lg p-4 cursor-pointer transition-all duration-200 hover:scale-105 ${
                statusFilter === 'Refusé par livreur' 
                  ? 'bg-red-100 border-red-300 shadow-md' 
                  : 'bg-red-50 border-red-200 hover:bg-red-100'
              }`}
              onClick={() => handleDashboardCardClick('Refusé par livreur')}
            >
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-red-600">Rejetées</p>
                  <p className="text-2xl font-bold text-red-900">{stats.rejectedMissions}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tableau des missions */}
      {statusFilter && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-blue-800">
                Affichage des missions avec le statut: <span className="font-bold">{statusFilter}</span>
              </span>
              <span className="px-2 py-1 bg-blue-200 text-blue-800 rounded-full text-xs font-medium">
                {getFilteredMissions().length} mission{getFilteredMissions().length !== 1 ? 's' : ''}
              </span>
            </div>
            <button
              onClick={() => setStatusFilter(null)}
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              Voir toutes les missions
            </button>
          </div>
        </div>
      )}
      
      <MissionPickupTable
        missions={getFilteredMissions()}
        onView={setViewMission}
        onEdit={() => {}} // Disabled for now
        onDelete={handleDelete}
        onChefAgenceScan={handleStartChefAgenceScanning}

        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        securityCodes={securityCodes}
        currentUser={currentUser}
      />

      {/* Modal création mission - Step by Step Wizard */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          resetWizard();
        }}
        title="Nouvelle mission de collecte"
        size="75%"
      >
        <div className="bg-white rounded-lg p-8 w-full max-w-6xl mx-auto">
          <h2 className="text-2xl font-bold mb-6 text-center">
            Nouvelle Mission de Collecte
          </h2>
          
          <div className="space-y-6">
            {/* Step Progress Indicator */}
            <div className="mb-8">
              <div className="flex items-center justify-center space-x-4">
                {[
                  { step: 1, title: "Livreur", color: "blue" },
                  { step: 2, title: "Demandes", color: "green" },
                  { step: 3, title: "Résumé", color: "purple" },
                  { step: 4, title: "Création", color: "orange" }
                ].map((stepInfo, index) => (
                  <div key={stepInfo.step} className="flex items-center">
                    <div className={`flex items-center justify-center w-12 h-12 rounded-full border-2 transition-all duration-300 ${
                      currentStep >= stepInfo.step 
                        ? `bg-${stepInfo.color}-600 border-${stepInfo.color}-600 text-white` 
                        : 'bg-white border-gray-300 text-gray-400'
                    }`}>
                      <span className="text-lg">{stepInfo.step}</span>
                    </div>
                    <div className="ml-3">
                      <div className={`text-sm font-medium ${
                        currentStep >= stepInfo.step ? 'text-gray-900' : 'text-gray-500'
                      }`}>
                        Étape {stepInfo.step}
                      </div>
                      <div className={`text-sm ${
                        currentStep >= stepInfo.step ? 'text-gray-700' : 'text-gray-400'
                      }`}>
                        {stepInfo.title}
                      </div>
                    </div>
                    {index < 3 && (
                      <div className={`w-8 h-0.5 transition-all duration-300 ${
                        currentStep > stepInfo.step ? 'bg-blue-600' : 'bg-gray-300'
                      }`}></div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Step Content */}
            <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
              
              {/* Step 1: Driver Selection */}
              {currentStep === 1 && (
                <div className="space-y-6">
                  <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
                      <span className="text-3xl font-bold text-blue-600">1</span>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Sélection du Livreur</h3>
                    <p className="text-gray-600">Choisissez le livreur qui effectuera la collecte</p>
                  </div>

                  {/* Agency Filter (only for Admin) */}
                  {(currentUser?.role === 'Admin' || currentUser?.role === 'Administration') && (
                    <div className="max-w-md mx-auto">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Filtrer par agence
                      </label>
                      <select
                        value={agencyFilter}
                        onChange={(e) => filterDriversByAgency(e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-md text-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Toutes les agences</option>
                        {Array.from(new Set(drivers.map(d => d.agency || d.governorate).filter(Boolean))).map(agency => (
                          <option key={agency} value={agency}>{agency}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Drivers List */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredDrivers.map(driver => (
                      <div
                        key={driver.id}
                        onClick={() => handleDriverSelection(driver)}
                        className={`p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 ${
                          selectedDriver?.id === driver.id
                            ? 'border-blue-500 bg-blue-50 shadow-lg'
                            : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-md'
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <div className="flex-shrink-0">
                            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                              <span className="text-blue-600 font-semibold text-lg">
                                {driver.name?.charAt(0) || 'L'}
                              </span>
                            </div>
                          </div>
                          <div className="flex-1">
                            <h4 className="font-semibold text-gray-900">{driver.name}</h4>
                            <p className="text-sm text-gray-600">
                              {driver.agency || driver.governorate || 'Agence non spécifiée'}
                            </p>
                            {driver.car_number && (
                              <p className="text-xs text-gray-500">Véhicule: {driver.car_number}</p>
                            )}
                          </div>
                          {selectedDriver?.id === driver.id && (
                            <div className="flex-shrink-0">
                              <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {filteredDrivers.length === 0 && (
                    <div className="text-center py-8">
                      <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <p className="text-gray-500 text-lg">Aucun livreur trouvé</p>
                      <p className="text-gray-400 text-sm">
                        {agencyFilter ? `Aucun livreur dans ${agencyFilter}` : 'Aucun livreur disponible'}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: Missions Selection */}
              {currentStep === 2 && (
                <div className="space-y-6">
                                      <div className="text-center mb-6">
                      <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                        <span className="text-3xl font-bold text-green-600">2</span>
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 mb-2">Sélection des Demandes</h3>
                      <p className="text-gray-600">
                        Sélectionnez les demandes acceptées à assigner au livreur
                      </p>
                    </div>

                  {selectedDriver && (
                    <div className="bg-blue-50 rounded-lg p-4 mb-6">
                      <div className="flex items-center justify-center space-x-2">
                        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-blue-800 font-medium">
                          Livreur sélectionné: {selectedDriver.name} ({selectedDriver.agency || selectedDriver.governorate})
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Missions List */}
                                      <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-lg font-semibold text-gray-900">Demandes acceptées disponibles</h4>
                        <span className="bg-green-100 text-green-800 text-sm font-medium px-3 py-1 rounded-full">
                          {filteredAcceptedMissions.length} demandes
                        </span>
                      </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredAcceptedMissions.map(mission => (
                        <div
                          key={mission.id}
                          onClick={() => handleMissionSelection(mission)}
                          className={`p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 ${
                            selectedMissions.find(m => m.id === mission.id)
                              ? 'border-green-500 bg-green-50 shadow-lg'
                              : 'border-gray-200 bg-white hover:border-green-300 hover:shadow-md'
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            <div className="flex-shrink-0">
                              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                                <span className="text-green-600 font-semibold text-lg">
                                  #{mission.id}
                                </span>
                              </div>
                            </div>
                            <div className="flex-1">
                              <h4 className="font-semibold text-gray-900">
                                Demande #{mission.id}
                              </h4>
                              <p className="text-sm text-gray-600">
                                Expéditeur: {mission.expediteur_name || 'N/A'}
                              </p>
                              <p className="text-xs text-gray-500">
                                Colis: {mission.parcel_count || 0}
                              </p>
                              <p className="text-xs text-gray-500">
                                {mission.expediteur_agency || 'N/A'}
                              </p>
                            </div>
                            {selectedMissions.find(m => m.id === mission.id) && (
                              <div className="flex-shrink-0">
                                <svg className="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {filteredAcceptedMissions.length === 0 && (
                      <div className="text-center py-8">
                        <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p className="text-gray-500 text-lg">Aucune demande acceptée trouvée</p>
                        <p className="text-gray-400 text-sm">
                          Aucune demande acceptée disponible pour ce livreur
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Step 3: Summary */}
              {currentStep === 3 && (
                <div className="space-y-6">
                  <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-100 rounded-full mb-4">
                      <span className="text-3xl font-bold text-purple-600">3</span>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Résumé de la Mission</h3>
                    <p className="text-gray-600">Vérifiez les détails avant de créer la mission</p>
                  </div>

                  {/* Mission Summary */}
                  <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4">Détails de la mission de collecte</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h5 className="font-medium text-gray-700 mb-2">Livreur</h5>
                        <div className="bg-blue-50 rounded-lg p-3">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                              <span className="text-blue-600 font-semibold">
                                {selectedDriver?.name?.charAt(0) || 'L'}
                              </span>
                            </div>
                            <div>
                              <p className="font-semibold text-gray-900">{selectedDriver?.name}</p>
                              <p className="text-sm text-gray-600">
                                {selectedDriver?.agency || selectedDriver?.governorate}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h5 className="font-medium text-gray-700 mb-2">Missions sélectionnées ({selectedMissions.length})</h5>
                        <div className="space-y-2">
                          {selectedMissions.map(mission => (
                            <div key={mission.id} className="bg-green-50 rounded-lg p-3">
                              <p className="font-semibold text-gray-900">Mission #{mission.id}</p>
                              <p className="text-sm text-gray-600">
                                {mission.expediteur_name || 'N/A'}
                              </p>
                              <p className="text-xs text-gray-500">
                                {mission.parcel_count || 0} colis • {mission.expediteur_agency || 'N/A'}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Colis Details */}
                    <div className="mt-6">
                      <h5 className="font-medium text-gray-700 mb-2">Détails des colis</h5>
                      <div className="bg-gray-50 rounded-lg p-4">
                        <div className="space-y-3">
                          {selectedMissions.map(mission => (
                            <div key={mission.id} className="border-b border-gray-200 pb-3 last:border-b-0">
                              <h6 className="font-semibold text-gray-800 mb-2">
                                Mission #{mission.id} - {mission.expediteur_name}
                              </h6>
                              {mission.parcels && mission.parcels.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                  {mission.parcels.map(parcel => (
                                    <div key={parcel.id} className="bg-white rounded p-2 text-sm">
                                      <div className="flex justify-between items-start">
                                        <div>
                                          <p className="font-medium text-gray-900">
                                            {parcel.tracking_number || `Colis ${parcel.id}`}
                                          </p>
                                          <p className="text-gray-600">
                                            {parcel.recipient_name || parcel.destination || 'N/A'}
                                          </p>
                                        </div>
                                        <div className="text-right">
                                          {statusBadge(parcel.status)}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-gray-500 text-sm">Aucun détail de colis disponible</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 4: Mission Creation */}
              {currentStep === 4 && (
                <div className="space-y-6">
                  <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-100 rounded-full mb-4">
                      <span className="text-3xl font-bold text-orange-600">4</span>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Création de la Mission</h3>
                    <p className="text-gray-600">Confirmez la création de la mission de collecte</p>
                  </div>

                  <div className="bg-orange-50 rounded-lg p-6 border border-orange-200">
                    <div className="text-center">
                      <svg className="w-16 h-16 text-orange-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <h4 className="text-lg font-semibold text-orange-900 mb-2">Prêt à créer la mission</h4>
                      <p className="text-orange-800">
                        Une fois créée, un code de mission sera généré pour le livreur.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Step Navigation */}
            <div className="flex justify-between items-center pt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
                disabled={currentStep === 1}
                className={`px-6 py-3 rounded-md text-base font-semibold transition-all duration-200 flex items-center space-x-2 ${
                  currentStep === 1
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span>Précédent</span>
              </button>

              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    resetWizard();
                  }}
                  className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-md text-base font-semibold hover:bg-gray-50 transition-all duration-200"
                >
                  Annuler
                </button>
                
                {currentStep < 4 ? (
                  <button
                    type="button"
                    onClick={() => {
                      // Validation for each step
                      if (currentStep === 1 && !selectedDriver) {
                        alert('Veuillez sélectionner un livreur');
                        return;
                      }
                                              if (currentStep === 2 && selectedMissions.length === 0) {
                          alert('Veuillez sélectionner au moins une demande');
                          return;
                        }
                      setCurrentStep(currentStep + 1);
                    }}
                    className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-md text-base font-semibold hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 shadow-lg hover:shadow-xl flex items-center space-x-2"
                  >
                    <span>Suivant</span>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    className="px-8 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-md text-base font-semibold hover:from-green-700 hover:to-green-800 transition-all duration-200 shadow-lg hover:shadow-xl flex items-center space-x-2"
                  >
                    <span>Créer la Mission</span>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal vue détaillée mission */}
      <Modal
        isOpen={!!viewMission}
        onClose={() => setViewMission(null)}
        title={viewMission ? `Détail de la mission #${viewMission.id}` : ""}
        size="lg"
                extraHeader={viewMission && (
          <div>
            {/* Debug info */}
            <div className="text-xs text-gray-500 mb-2">
              Debug: User role: {currentUser?.role}, Mission status: {viewMission.status}, Driver: {viewMission.driver?.name || 'None'}
            </div>
            <div className="flex space-x-2">
            <button
              onClick={handleExportPDF}
              className="bg-gradient-to-r from-blue-500 to-blue-700 text-white px-4 py-2 rounded-lg font-semibold shadow hover:scale-105 transition-transform flex items-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Exporter en PDF
            </button>
            </div>
          </div>
        )}
      >
        {viewMission && (
          <div ref={detailRef} className="bg-white rounded-2xl shadow-xl p-8 max-w-2xl mx-auto border border-blue-100 animate-fade-in">
            <div className="flex flex-wrap justify-between gap-6 mb-6">
              <div className="flex-1 min-w-[180px]">
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-block bg-blue-100 text-blue-700 rounded-full px-3 py-1 text-xs font-bold">Livreur</span>
                  <span className="font-semibold text-lg">{viewMission.driver?.name || "Non assigné"}</span>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-block bg-green-100 text-green-700 rounded-full px-3 py-1 text-xs font-bold">N° Mission</span>
                  <span className="font-semibold text-lg">{viewMission.mission_number}</span>
                </div>
              </div>
              <div className="flex-1 min-w-[180px] text-right">
                <div className="mb-2">
                  <span className="font-semibold text-gray-700">Date prévue :</span>
                  <div className="text-base">{viewMission.scheduled_time}</div>
                </div>
                <div className="mb-2">
                  <span className="font-semibold text-gray-700">Statut :</span>
                  <div>{statusBadge(viewMission.status)}</div>
                </div>
              </div>
            </div>
            
            {/* Security Code Section */}
            <div className="border-t border-gray-200 pt-4 mb-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-gray-700 mb-1 flex items-center gap-2">
                      Code de Sécurité
                    </div>
                    <div className="text-sm text-gray-600">
                      Ce code est requis pour que le livreur puisse terminer la mission
                    </div>
                  </div>
                  <div className="text-right">
                    <code className="bg-white px-3 py-2 rounded border text-lg font-mono text-gray-800">
                      {securityCodes[viewMission.id] || 'Non généré'}
                    </code>
                    {securityCodes[viewMission.id] && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(securityCodes[viewMission.id]);
                          alert('Code copié dans le presse-papiers!');
                        }}
                        className="ml-2 text-blue-600 hover:text-blue-800 text-sm"
                        title="Copier le code"
                      >
                        Copier
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="border-t border-gray-200 pt-4">
              <div className="font-semibold text-gray-700 mb-2 text-lg flex items-center gap-2">
                <span className="inline-block bg-purple-100 text-purple-700 rounded-full px-3 py-1 text-xs font-bold">Colis associés</span>
                <span className="text-xs text-gray-400">({viewMission.parcels?.length || 0})</span>
              </div>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {viewMission.parcels?.map((c) => (
                  <li key={c.id} className="bg-gray-50 rounded-lg p-3 shadow flex flex-col gap-1 border border-gray-100">
                    <span className="font-medium text-blue-700">{c.id}</span>
                    <span className="text-xs text-gray-600">Destinataire : <span className="font-semibold">{c.destination}</span></span>
                    <span className="text-xs">{statusBadge(c.status)}</span>
                  </li>
                )) || <li className="text-gray-500 text-center col-span-2">Aucun colis associé</li>}
              </ul>
            </div>
            <div className="text-xs text-gray-400 mt-6">Mission créée le {viewMission.created_at}</div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={isScanModalOpen}
        onClose={() => setIsScanModalOpen(false)}
        title="Ajouter des colis à la mission"
        size="md"
      >
        <MissionColisScan onValidate={handleScanValidate} onClose={() => setIsScanModalOpen(false)} />
      </Modal>

      {/* Pickup Mission Scanning Modal */}
      <Modal
        isOpen={isPickupScanModalOpen}
        onClose={() => setIsPickupScanModalOpen(false)}
        title={`Scanner les colis - Mission #${scanningMission?.id}`}
        size="xl"
      >
        {scanningMission && (
          <div className="p-6">
            <div className="space-y-6">
              {/* Scan Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Scanner le numéro de suivi du colis
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handlePickupParcelScan(scanInput);
                      }
                    }}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Entrez le numéro de suivi..."
                    autoFocus
                  />
                  <button
                    onClick={() => handlePickupParcelScan(scanInput)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                  >
                    Scanner
                  </button>
                </div>
              </div>

              {/* Progress */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700">Progression</span>
                  <span className="text-sm text-gray-600">
                    {scannedParcels.length} / {scanningMission.parcels?.length || 0} colis scannés
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ 
                      width: `${scanningMission.parcels?.length ? (scannedParcels.length / scanningMission.parcels.length) * 100 : 0}%` 
                    }}
                  ></div>
                </div>
              </div>

              {/* Scanned parcels list */}
              <div>
                <h3 className="font-medium text-gray-900 mb-2">
                  Colis scannés ({scannedParcels.length})
                </h3>
                <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg">
                  {scannedParcels.length === 0 ? (
                    <p className="p-4 text-gray-500 text-center">Aucun colis scanné</p>
                  ) : (
                    <div className="divide-y divide-gray-200">
                      {scannedParcels.map((parcel, index) => (
                        <div key={index} className="p-3 flex justify-between items-center">
                          <div>
                            <p className="font-medium">{parcel.tracking_number || parcel.id}</p>
                            <p className="text-sm text-gray-600">{parcel.destination}</p>
                          </div>
                          <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded-full">
                            ✓ Scanné
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Expected parcels list */}
              <div>
                <h3 className="font-medium text-gray-900 mb-2">
                  Colis attendus ({scanningMission.parcels?.length || 0})
                </h3>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          N° Suivi
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Destination
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Statut
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {scanningMission.parcels?.map((parcel) => {
                        const isScanned = scannedParcels.some(sp => sp.id === parcel.id);
                        return (
                          <tr key={parcel.id} className={isScanned ? 'bg-green-50' : ''}>
                            <td className="px-4 py-2 text-sm font-medium text-gray-900">
                              {parcel.tracking_number || parcel.id}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-600">
                              {parcel.destination}
                            </td>
                            <td className="px-4 py-2 text-sm">
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                isScanned ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                              }`}>
                                {isScanned ? '✓ Scanné' : 'En attente'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal actions */}
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setIsPickupScanModalOpen(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Chef d'agence Scan Modal */}
      <Modal
        isOpen={isChefAgenceScanModalOpen}
        onClose={() => setIsChefAgenceScanModalOpen(false)}
        title={`Réception des Colis - Mission #${chefAgenceScanningMission?.mission_number || chefAgenceScanningMission?.id}`}
        size="xl"
      >
        {chefAgenceScanningMission && (
          <ChefAgenceMissionScan
            mission={chefAgenceScanningMission}
            onScan={handleChefAgenceScan}
            onClose={() => setIsChefAgenceScanModalOpen(false)}
            onGenerateCode={handleChefAgenceGenerateCode}
          />
        )}
      </Modal>
    </div>
  );
};

export default Pickup; 
