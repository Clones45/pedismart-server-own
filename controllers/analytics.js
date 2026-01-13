// COMMENTED OUT: Payment/Fare - Driver handles pricing manually
// Note: All fare and revenue calculations in this file will return 0 or minimal values
// since fare is set to 0 in ride creation. Analytics data is kept for structure but
// revenue/fare metrics are not meaningful until pricing is re-enabled.

import User from '../models/User.js';
import Ride from '../models/Ride.js';
import Rating from '../models/Rating.js';
import { StatusCodes } from 'http-status-codes';

// Helper function to get date range based on filter
const getDateRange = (filter) => {
  const now = new Date();
  const endDate = now;
  let startDate;

  switch (filter) {
    case '24h':
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      break;
    case 'all':
      // Show all data from the beginning of time
      startDate = new Date('2020-01-01');
      break;
    default:
      // Default to showing all data instead of just 24h
      startDate = new Date('2020-01-01');
  }

  console.log(`📅 Date range for filter '${filter}':`, {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString()
  });

  return { startDate, endDate };
};

// Get user statistics (gender distribution)
export const getUserStats = async (req, res) => {
  try {
    const { timeFilter = '24h' } = req.query;
    const { startDate, endDate } = getDateRange(timeFilter);

    // Get gender distribution - all users, not time-filtered
    const genderStats = await User.aggregate([
      {
        $match: {
          role: { $ne: 'admin' }
        }
      },
      {
        $group: {
          _id: { $ifNull: ['$sex', 'unknown'] },
          count: { $sum: 1 }
        }
      }
    ]);

    // Get role distribution - all users, not time-filtered
    const roleStats = await User.aggregate([
      {
        $match: {
          role: { $ne: 'admin' }
        }
      },
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      }
    ]);

    // Format the response
    const formattedGenderStats = {
      male: 0,
      female: 0
    };

    genderStats.forEach(stat => {
      if (stat._id) {
        formattedGenderStats[stat._id] = stat.count;
      }
    });

    const formattedRoleStats = {
      customer: 0,
      rider: 0
    };

    roleStats.forEach(stat => {
      if (stat._id && stat._id !== 'admin') {
        formattedRoleStats[stat._id] = stat.count;
      }
    });

    // Get total users
    const totalUsers = await User.countDocuments({
      role: { $ne: 'admin' }
    });

    // Get new users in the time period
    const newUsers = await User.countDocuments({
      createdAt: { $gte: startDate, $lte: endDate },
      role: { $ne: 'admin' }
    });

    res.status(StatusCodes.OK).json({
      timeFilter,
      period: {
        start: startDate,
        end: endDate
      },
      totalUsers,
      newUsers,
      genderDistribution: formattedGenderStats,
      roleDistribution: formattedRoleStats
    });
  } catch (error) {
    console.error('Error fetching user statistics:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to fetch user statistics',
      error: error.message
    });
  }
};

// Get ride statistics (vehicle types, etc.)
export const getRideStats = async (req, res) => {
  try {
    const { timeFilter = '24h' } = req.query;
    const { startDate, endDate } = getDateRange(timeFilter);

    // Get vehicle type distribution
    const vehicleStats = await Ride.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: { $ifNull: ['$vehicle', 'unknown'] },
          count: { $sum: 1 },
          totalFare: { $sum: { $ifNull: ['$fare', 0] } },
          totalDistance: { $sum: { $ifNull: ['$distance', 0] } }
        }
      }
    ]);

    // Get ride status distribution
    const statusStats = await Ride.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Format vehicle stats (only Tricycle is active)
    const formattedVehicleStats = {
      // "Single Motorcycle": { count: 0, totalFare: 0, totalDistance: 0 }, // Commented out: Only using Tricycle
      "Tricycle": { count: 0, totalFare: 0, totalDistance: 0 },
      // "Cab": { count: 0, totalFare: 0, totalDistance: 0 } // Commented out: Only using Tricycle
    };

    vehicleStats.forEach(stat => {
      if (stat._id && formattedVehicleStats.hasOwnProperty(stat._id)) {
        formattedVehicleStats[stat._id] = {
          count: stat.count,
          totalFare: stat.totalFare || 0,
          totalDistance: stat.totalDistance || 0
        };
      } else if (stat._id === 'unknown') {
        console.log(`Found ${stat.count} rides with unknown vehicle type`);
      }
    });

    // Format status stats
    const formattedStatusStats = {
      SEARCHING_FOR_RIDER: 0,
      START: 0,
      ARRIVED: 0,
      COMPLETED: 0
    };

    statusStats.forEach(stat => {
      if (stat._id) {
        formattedStatusStats[stat._id] = stat.count;
      }
    });

    // Get total rides in the time period
    const totalRides = await Ride.countDocuments({
      createdAt: { $gte: startDate, $lte: endDate }
    });

    // Get total revenue in the time period
    const revenueResult = await Ride.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: 'COMPLETED'
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$fare' },
          totalDistance: { $sum: '$distance' },
          count: { $sum: 1 }
        }
      }
    ]);

    const totalRevenue = revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;
    const totalDistance = revenueResult.length > 0 ? revenueResult[0].totalDistance : 0;
    const completedRides = revenueResult.length > 0 ? revenueResult[0].count : 0;

    res.status(StatusCodes.OK).json({
      timeFilter,
      period: {
        start: startDate,
        end: endDate
      },
      totalRides,
      completedRides,
      totalRevenue,
      totalDistance,
      vehicleDistribution: formattedVehicleStats,
      statusDistribution: formattedStatusStats
    });
  } catch (error) {
    console.error('Error fetching ride statistics:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to fetch ride statistics',
      error: error.message
    });
  }
};

// Get combined analytics data
export const getCombinedAnalytics = async (req, res) => {
  try {
    const { timeFilter = '24h' } = req.query;
    const { startDate, endDate } = getDateRange(timeFilter);

    // Get all users statistics (not time-filtered for user counts)
    const userStats = await User.aggregate([
      {
        $match: {
          role: { $ne: 'admin' }
        }
      },
      {
        $group: {
          _id: {
            role: '$role',
            sex: '$sex'
          },
          count: { $sum: 1 }
        }
      }
    ]);

    // Get rider vehicle type statistics (all riders, not time-filtered)
    const riderVehicleStats = await User.aggregate([
      {
        $match: {
          role: 'rider',
        }
      },
      {
        $group: {
          _id: { $ifNull: ['$vehicleType', 'Unknown'] },
          count: { $sum: 1 }
        }
      }
    ]);

    // Get ride statistics
    const rideStats = await Ride.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$vehicle',
          count: { $sum: 1 },
          totalFare: { $sum: '$fare' },
          totalDistance: { $sum: '$distance' }
        }
      }
    ]);

    // Format user stats
    const formattedUserStats = {
      gender: {
        male: {
          customer: 0,
          rider: 0,
          total: 0
        },
        female: {
          customer: 0,
          rider: 0,
          total: 0
        },
        total: {
          customer: 0,
          rider: 0,
          total: 0
        }
      }
    };

    userStats.forEach(stat => {
      const role = stat._id.role;
      const sex = stat._id.sex || 'unknown';
      
      if (role !== 'admin') {
        // Initialize the gender category if it doesn't exist
        if (sex !== 'male' && sex !== 'female') {
          // Skip unknown gender or add to a separate category if needed
          return;
        }
        
        // Make sure the role is valid
        if (role !== 'customer' && role !== 'rider') {
          return;
        }
        
        formattedUserStats.gender[sex][role] = stat.count;
        formattedUserStats.gender[sex].total += stat.count;
        formattedUserStats.gender.total[role] += stat.count;
        formattedUserStats.gender.total.total += stat.count;
      }
    });

    // Format vehicle stats (only Tricycle is active)
    const formattedVehicleStats = {
      riders: {
        // 'Single Motorcycle': 0, // Commented out: Only using Tricycle
        'Tricycle': 0,
        // 'Cab': 0 // Commented out: Only using Tricycle
      },
      rides: {
        // "Single Motorcycle": { count: 0, totalFare: 0, totalDistance: 0 }, // Commented out: Only using Tricycle
        "Tricycle": { count: 0, totalFare: 0, totalDistance: 0 },
        // "Cab": { count: 0, totalFare: 0, totalDistance: 0 } // Commented out: Only using Tricycle
      }
    };

    riderVehicleStats.forEach(stat => {
      if (stat._id && formattedVehicleStats.riders.hasOwnProperty(stat._id)) {
        formattedVehicleStats.riders[stat._id] = stat.count;
      } else if (stat._id === 'Unknown') {
        // Distribute unknown vehicle types proportionally or add a new category
        // For now, we'll just log them
        console.log(`Found ${stat.count} riders with unknown vehicle type`);
      }
    });

    rideStats.forEach(stat => {
      if (stat._id && formattedVehicleStats.rides.hasOwnProperty(stat._id)) {
        formattedVehicleStats.rides[stat._id] = {
          count: stat.count,
          totalFare: stat.totalFare || 0,
          totalDistance: stat.totalDistance || 0
        };
      } else if (stat._id) {
        console.log(`Found rides with unrecognized vehicle type: ${stat._id}`);
      }
    });

    // Get total counts - all users, not time-filtered
    const totalUsers = await User.countDocuments({
      role: { $ne: 'admin' }
    });

    const totalRides = await Ride.countDocuments({
      createdAt: { $gte: startDate, $lte: endDate }
    });

    const completedRidesData = await Ride.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: 'COMPLETED'
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: { $ifNull: ['$fare', 0] } },
          totalDistance: { $sum: { $ifNull: ['$distance', 0] } },
          count: { $sum: 1 }
        }
      }
    ]);

    const totalRevenue = completedRidesData.length > 0 ? completedRidesData[0].totalRevenue : 0;
    const totalDistance = completedRidesData.length > 0 ? completedRidesData[0].totalDistance : 0;
    const completedRides = completedRidesData.length > 0 ? completedRidesData[0].count : 0;

    res.status(StatusCodes.OK).json({
      timeFilter,
      period: {
        start: startDate,
        end: endDate
      },
      totalUsers,
      totalRides,
      completedRides,
      totalRevenue,
      totalDistance,
      userStats: formattedUserStats,
      vehicleStats: formattedVehicleStats
    });
  } catch (error) {
    console.error('Error fetching combined analytics:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to fetch combined analytics',
      error: error.message
    });
  }
};

// Debug endpoint to check completed rides
export const getCompletedRidesDebug = async (req, res) => {
  try {
    console.log('🔍 Debug: Checking completed rides in database...');
    
    // Get all completed rides without date filter
    const allCompletedRides = await Ride.find({ 
      status: 'COMPLETED' 
    }).populate('customer', 'firstName lastName').populate('rider', 'firstName lastName vehicleType');
    
    console.log(`📊 Found ${allCompletedRides.length} completed rides total`);
    
    // Get completed rides with date breakdown
    const ridesByDate = await Ride.aggregate([
      { $match: { status: 'COMPLETED' } },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }
          },
          count: { $sum: 1 },
          totalRevenue: { $sum: '$fare' }
        }
      },
      { $sort: { '_id.date': -1 } }
    ]);
    
    res.status(StatusCodes.OK).json({
      totalCompletedRides: allCompletedRides.length,
      ridesByDate,
      sampleRides: allCompletedRides.slice(0, 3).map(ride => ({
        id: ride._id,
        status: ride.status,
        fare: ride.fare,
        createdAt: ride.createdAt,
        customer: ride.customer ? `${ride.customer.firstName} ${ride.customer.lastName}` : 'Unknown',
        rider: ride.rider ? `${ride.rider.firstName} ${ride.rider.lastName}` : 'Unknown'
      }))
    });
  } catch (error) {
    console.error('❌ Error in debug endpoint:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to fetch debug data',
      error: error.message
    });
  }
};

// Get top performing riders
export const getTopPerformingRiders = async (req, res) => {
  try {
    const { timeFilter = 'all', limit = 10 } = req.query;
    const { startDate, endDate } = getDateRange(timeFilter);

    console.log(`🏆 Fetching top riders with filter: ${timeFilter}`);

    // Get top riders based on completed rides and ratings
    const topRiders = await Ride.aggregate([
      {
        $match: {
          status: 'COMPLETED',
          createdAt: { $gte: startDate, $lte: endDate },
          rider: { $ne: null }
        }
      },
      {
        $group: {
          _id: '$rider',
          totalRides: { $sum: 1 },
          totalRevenue: { $sum: '$fare' },
          totalDistance: { $sum: '$distance' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'riderInfo'
        }
      },
      {
        $lookup: {
          from: 'ratings',
          localField: '_id',
          foreignField: 'rider',
          as: 'ratings'
        }
      },
      {
        $addFields: {
          averageRating: {
            $cond: {
              if: { $gt: [{ $size: '$ratings' }, 0] },
              then: { $avg: '$ratings.rating' },
              else: 0
            }
          },
          totalRatings: { $size: '$ratings' }
        }
      },
      {
        $project: {
          riderId: '$_id',
          firstName: { $arrayElemAt: ['$riderInfo.firstName', 0] },
          lastName: { $arrayElemAt: ['$riderInfo.lastName', 0] },
          vehicleType: { $arrayElemAt: ['$riderInfo.vehicleType', 0] },
          totalRides: 1,
          totalRevenue: 1,
          totalDistance: 1,
          averageRating: { $round: ['$averageRating', 2] },
          totalRatings: 1
        }
      },
      {
        $sort: { totalRides: -1, averageRating: -1 }
      },
      {
        $limit: parseInt(limit)
      }
    ]);

    res.status(StatusCodes.OK).json({
      timeFilter,
      period: { start: startDate, end: endDate },
      topRiders
    });
  } catch (error) {
    console.error('Error fetching top performing riders:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to fetch top performing riders',
      error: error.message
    });
  }
};

// Get revenue trends over time
export const getRevenueTrends = async (req, res) => {
  try {
    const { timeFilter = 'all' } = req.query;
    const { startDate, endDate } = getDateRange(timeFilter);

    let groupBy;
    let dateFormat;
    
    // Determine grouping based on time filter
    switch (timeFilter) {
      case '24h':
        groupBy = {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' },
          hour: { $hour: '$createdAt' }
        };
        dateFormat = '%Y-%m-%d %H:00';
        break;
      case 'week':
        groupBy = {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' }
        };
        dateFormat = '%Y-%m-%d';
        break;
      case 'month':
        groupBy = {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          week: { $week: '$createdAt' }
        };
        dateFormat = '%Y-W%U';
        break;
      default:
        groupBy = {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' },
          hour: { $hour: '$createdAt' }
        };
        dateFormat = '%Y-%m-%d %H:00';
    }

    const revenueTrends = await Ride.aggregate([
      {
        $match: {
          status: 'COMPLETED',
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: groupBy,
          revenue: { $sum: '$fare' },
          rides: { $sum: 1 },
          distance: { $sum: '$distance' }
        }
      },
      {
        $addFields: {
          period: {
            $dateToString: {
              format: dateFormat,
              date: {
                $dateFromParts: {
                  year: '$_id.year',
                  month: '$_id.month',
                  day: '$_id.day',
                  hour: { $ifNull: ['$_id.hour', 0] }
                }
              }
            }
          }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.hour': 1 }
      }
    ]);

    res.status(StatusCodes.OK).json({
      timeFilter,
      period: { start: startDate, end: endDate },
      trends: revenueTrends
    });
  } catch (error) {
    console.error('Error fetching revenue trends:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to fetch revenue trends',
      error: error.message
    });
  }
};

// Get real-time ride status monitoring
export const getRideStatusMonitoring = async (req, res) => {
  try {
    // Get current ride status distribution
    const currentRideStatus = await Ride.aggregate([
      {
        $match: {
          status: { $ne: 'COMPLETED' }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get active riders count
    const activeRiders = await Ride.countDocuments({
      status: { $in: ['START', 'ARRIVED'] },
      rider: { $ne: null }
    });

    // Get waiting customers count
    const waitingCustomers = await Ride.countDocuments({
      status: 'SEARCHING_FOR_RIDER'
    });

    // Get average wait time for completed rides today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const avgWaitTime = await Ride.aggregate([
      {
        $match: {
          status: 'COMPLETED',
          createdAt: { $gte: today, $lt: tomorrow },
          updatedAt: { $exists: true }
        }
      },
      {
        $addFields: {
          waitTime: {
            $subtract: ['$updatedAt', '$createdAt']
          }
        }
      },
      {
        $group: {
          _id: null,
          avgWaitTime: { $avg: '$waitTime' }
        }
      }
    ]);

    const formattedStatus = {
      SEARCHING_FOR_RIDER: 0,
      START: 0,
      ARRIVED: 0
    };

    currentRideStatus.forEach(status => {
      if (formattedStatus.hasOwnProperty(status._id)) {
        formattedStatus[status._id] = status.count;
      }
    });

    res.status(StatusCodes.OK).json({
      currentStatus: formattedStatus,
      activeRiders,
      waitingCustomers,
      averageWaitTime: avgWaitTime.length > 0 ? Math.round(avgWaitTime[0].avgWaitTime / 1000 / 60) : 0 // in minutes
    });
  } catch (error) {
    console.error('Error fetching ride status monitoring:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to fetch ride status monitoring',
      error: error.message
    });
  }
};

// Get peak hours analysis
export const getPeakHoursAnalysis = async (req, res) => {
  try {
    const { timeFilter = 'all' } = req.query;
    const { startDate, endDate } = getDateRange(timeFilter);

    const peakHours = await Ride.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            hour: { $hour: '$createdAt' },
            dayOfWeek: { $dayOfWeek: '$createdAt' }
          },
          totalRides: { $sum: 1 },
          totalRevenue: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, '$fare', 0] } }
        }
      },
      {
        $group: {
          _id: '$_id.hour',
          avgRides: { $avg: '$totalRides' },
          totalRides: { $sum: '$totalRides' },
          totalRevenue: { $sum: '$totalRevenue' }
        }
      },
      {
        $sort: { '_id': 1 }
      }
    ]);

    // Get day of week analysis
    const dayOfWeekAnalysis = await Ride.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: { $dayOfWeek: '$createdAt' },
          totalRides: { $sum: 1 },
          totalRevenue: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, '$fare', 0] } }
        }
      },
      {
        $sort: { '_id': 1 }
      }
    ]);

    // Convert day numbers to names
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const formattedDayAnalysis = dayOfWeekAnalysis.map(day => ({
      day: dayNames[day._id - 1],
      totalRides: day.totalRides,
      totalRevenue: day.totalRevenue
    }));

    res.status(StatusCodes.OK).json({
      timeFilter,
      period: { start: startDate, end: endDate },
      hourlyData: peakHours,
      dailyData: formattedDayAnalysis
    });
  } catch (error) {
    console.error('Error fetching peak hours analysis:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to fetch peak hours analysis',
      error: error.message
    });
  }
};

// Get popular routes analysis
export const getPopularRoutes = async (req, res) => {
  try {
    const { timeFilter = 'all', limit = 10 } = req.query;
    const { startDate, endDate } = getDateRange(timeFilter);

    const popularRoutes = await Ride.aggregate([
      {
        $match: {
          status: 'COMPLETED',
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            pickupAddress: '$pickup.address',
            dropAddress: '$drop.address'
          },
          count: { $sum: 1 },
          totalRevenue: { $sum: '$fare' },
          avgDistance: { $avg: '$distance' },
          avgFare: { $avg: '$fare' }
        }
      },
      {
        $project: {
          route: {
            $concat: ['$_id.pickupAddress', ' → ', '$_id.dropAddress']
          },
          pickupAddress: '$_id.pickupAddress',
          dropAddress: '$_id.dropAddress',
          count: 1,
          totalRevenue: 1,
          avgDistance: { $round: ['$avgDistance', 2] },
          avgFare: { $round: ['$avgFare', 2] }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: parseInt(limit)
      }
    ]);

    // Get popular pickup locations
    const popularPickups = await Ride.aggregate([
      {
        $match: {
          status: 'COMPLETED',
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$pickup.address',
          count: { $sum: 1 },
          totalRevenue: { $sum: '$fare' }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: parseInt(limit)
      }
    ]);

    // Get popular drop locations
    const popularDrops = await Ride.aggregate([
      {
        $match: {
          status: 'COMPLETED',
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$drop.address',
          count: { $sum: 1 },
          totalRevenue: { $sum: '$fare' }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: parseInt(limit)
      }
    ]);

    res.status(StatusCodes.OK).json({
      timeFilter,
      period: { start: startDate, end: endDate },
      popularRoutes,
      popularPickups,
      popularDrops
    });
  } catch (error) {
    console.error('Error fetching popular routes:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to fetch popular routes',
      error: error.message
    });
  }
};
 
 / /   G e t   a c c u r a c y   m e t r i c s   ( D i s t a n c e   &   T i m e )  
 e x p o r t   c o n s t   g e t A c c u r a c y M e t r i c s   =   a s y n c   ( r e q ,   r e s )   = >   {  
     t r y   {  
         c o n s t   {   t i m e F i l t e r   =   ' a l l '   }   =   r e q . q u e r y ;  
         c o n s t   {   s t a r t D a t e ,   e n d D a t e   }   =   g e t D a t e R a n g e ( t i m e F i l t e r ) ;  
  
         c o n s o l e . l o g ( ` � x}�   C a l c u l a t i n g   a c c u r a c y   m e t r i c s   f o r   p e r i o d :   $ { s t a r t D a t e . t o I S O S t r i n g ( ) }   -   $ { e n d D a t e . t o I S O S t r i n g ( ) } ` ) ;  
  
         c o n s t   a c c u r a c y S t a t s   =   a w a i t   R i d e . a g g r e g a t e ( [  
             {  
                 $ m a t c h :   {  
                     s t a t u s :   ' C O M P L E T E D ' ,  
                     c r e a t e d A t :   {   $ g t e :   s t a r t D a t e ,   $ l t e :   e n d D a t e   } ,  
                     / /   O n l y   i n c l u d e   r i d e s   t h a t   h a v e   r o u t e   l o g s  
                     ' r o u t e L o g s ' :   {   $ e x i s t s :   t r u e   }  
                 }  
             } ,  
             {  
                 $ a d d F i e l d s :   {  
                     / /   C a l c u l a t e   a c t u a l   d u r a t i o n   i n   s e c o n d s  
                     a c t u a l D u r a t i o n :   {  
                         $ d i v i d e :   [  
                             {   $ s u b t r a c t :   [ {   $ i f N u l l :   [ ' $ t r i p L o g s . d r o p o f f T i m e ' ,   ' $ t r i p L o g s . e n d T i m e ' ]   } ,   ' $ t r i p L o g s . s t a r t T i m e ' ]   } ,  
                             1 0 0 0  
                         ]  
                     } ,  
                     / /   C a l c u l a t e   d i s t a n c e   d e v i a t i o n  
                     d i s t a n c e D i f f :   {  
                         $ a b s :   {   $ s u b t r a c t :   [ ' $ r o u t e L o g s . r o u t e D i s t a n c e ' ,   ' $ r o u t e L o g s . e s t i m a t e d D i s t a n c e ' ]   }  
                     } ,  
                     / /   C a l c u l a t e   t i m e   d e v i a t i o n   ( i f   E T A   e x i s t s )  
                     t i m e D i f f :   {  
                         $ c o n d :   {  
                             i f :   {   $ a n d :   [ ' $ r o u t e L o g s . e s t i m a t e d D u r a t i o n ' ,   {   $ g t :   [ ' $ r o u t e L o g s . e s t i m a t e d D u r a t i o n ' ,   0 ]   } ]   } ,  
                             t h e n :   {  
                                 $ a b s :   {  
                                     $ s u b t r a c t :   [  
                                         {   $ d i v i d e :   [ {   $ s u b t r a c t :   [ {   $ i f N u l l :   [ ' $ t r i p L o g s . d r o p o f f T i m e ' ,   ' $ t r i p L o g s . e n d T i m e ' ]   } ,   ' $ t r i p L o g s . s t a r t T i m e ' ]   } ,   1 0 0 0 ]   } ,  
                                         ' $ r o u t e L o g s . e s t i m a t e d D u r a t i o n '  
                                     ]  
                                 }  
                             } ,  
                             e l s e :   n u l l  
                         }  
                     }  
                 }  
             } ,  
             {  
                 $ g r o u p :   {  
                     _ i d :   n u l l ,  
                     t o t a l R i d e s :   {   $ s u m :   1   } ,  
                     / /   C o u n t   r i d e s   w i t h   v a l i d   d a t a   f o r   e a c h   m e t r i c  
                     r i d e s W i t h D i s t a n c e D a t a :   {  
                         $ s u m :   {    
                             $ c o n d :   [ {   $ a n d :   [ ' $ r o u t e L o g s . r o u t e D i s t a n c e ' ,   ' $ r o u t e L o g s . e s t i m a t e d D i s t a n c e ' ]   } ,   1 ,   0 ]    
                         }  
                     } ,  
                     r i d e s W i t h T i m e D a t a :   {  
                         $ s u m :   {    
                             $ c o n d :   [ {   $ a n d :   [ ' $ r o u t e L o g s . e s t i m a t e d D u r a t i o n ' ,   {   $ n e :   [ ' $ t i m e D i f f ' ,   n u l l ]   } ]   } ,   1 ,   0 ]    
                         }  
                     } ,  
                     / /   A c c u m u l a t e   r a w   e r r o r s  
                     t o t a l D i s t a n c e D i f f :   {   $ s u m :   {   $ i f N u l l :   [ ' $ d i s t a n c e D i f f ' ,   0 ]   }   } ,  
                     t o t a l T i m e D i f f :   {   $ s u m :   {   $ i f N u l l :   [ ' $ t i m e D i f f ' ,   0 ]   }   } ,  
                     / /   A c c u m u l a t e   t o t a l s   f o r   a v e r a g i n g  
                     t o t a l E s t i m a t e d D i s t a n c e :   {   $ s u m :   {   $ i f N u l l :   [ ' $ r o u t e L o g s . e s t i m a t e d D i s t a n c e ' ,   0 ]   }   } ,  
                     t o t a l E s t i m a t e d D u r a t i o n :   {   $ s u m :   {   $ i f N u l l :   [ ' $ r o u t e L o g s . e s t i m a t e d D u r a t i o n ' ,   0 ]   }   }  
                 }  
             }  
         ] ) ;  
  
         l e t   m e t r i c s   =   {  
             p e r i o d :   {   s t a r t :   s t a r t D a t e ,   e n d :   e n d D a t e   } ,  
             t o t a l A n a l y z e d R i d e s :   0 ,  
             d i s t a n c e A c c u r a c y :   {  
                 a c c u r a c y P e r c e n t a g e :   0 ,  
                 a v e r a g e D e v i a t i o n K m :   0 ,  
                 a n a l y z e d C o u n t :   0  
             } ,  
             t i m e A c c u r a c y :   {  
                 a c c u r a c y P e r c e n t a g e :   0 ,  
                 a v e r a g e D e v i a t i o n M i n u t e s :   0 ,  
                 a n a l y z e d C o u n t :   0  
             }  
         } ;  
  
         i f   ( a c c u r a c y S t a t s . l e n g t h   >   0 )   {  
             c o n s t   s t a t s   =   a c c u r a c y S t a t s [ 0 ] ;  
             m e t r i c s . t o t a l A n a l y z e d R i d e s   =   s t a t s . t o t a l R i d e s ;  
  
             / /   C a l c u l a t e   D i s t a n c e   A c c u r a c y  
             i f   ( s t a t s . r i d e s W i t h D i s t a n c e D a t a   >   0   & &   s t a t s . t o t a l E s t i m a t e d D i s t a n c e   >   0 )   {  
                 / /   A c c u r a c y   =   1 0 0   -   ( T o t a l   E r r o r   /   T o t a l   E s t i m a t e d   *   1 0 0 )  
                 c o n s t   e r r o r R a t e   =   ( s t a t s . t o t a l D i s t a n c e D i f f   /   s t a t s . t o t a l E s t i m a t e d D i s t a n c e )   *   1 0 0 ;  
                 m e t r i c s . d i s t a n c e A c c u r a c y   =   {  
                     a c c u r a c y P e r c e n t a g e :   M a t h . m a x ( 0 ,   1 0 0   -   e r r o r R a t e ) . t o F i x e d ( 2 ) ,  
                     a v e r a g e D e v i a t i o n K m :   ( s t a t s . t o t a l D i s t a n c e D i f f   /   s t a t s . r i d e s W i t h D i s t a n c e D a t a ) . t o F i x e d ( 2 ) ,  
                     a n a l y z e d C o u n t :   s t a t s . r i d e s W i t h D i s t a n c e D a t a  
                 } ;  
             }  
  
             / /   C a l c u l a t e   T i m e   A c c u r a c y  
             i f   ( s t a t s . r i d e s W i t h T i m e D a t a   >   0   & &   s t a t s . t o t a l E s t i m a t e d D u r a t i o n   >   0 )   {  
                 c o n s t   e r r o r R a t e   =   ( s t a t s . t o t a l T i m e D i f f   /   s t a t s . t o t a l E s t i m a t e d D u r a t i o n )   *   1 0 0 ;  
                 m e t r i c s . t i m e A c c u r a c y   =   {  
                     a c c u r a c y P e r c e n t a g e :   M a t h . m a x ( 0 ,   1 0 0   -   e r r o r R a t e ) . t o F i x e d ( 2 ) ,  
                     a v e r a g e D e v i a t i o n M i n u t e s :   ( s t a t s . t o t a l T i m e D i f f   /   s t a t s . r i d e s W i t h T i m e D a t a   /   6 0 ) . t o F i x e d ( 1 ) ,   / /   C o n v e r t   s e c o n d s   t o   m i n u t e s  
                     a n a l y z e d C o u n t :   s t a t s . r i d e s W i t h T i m e D a t a  
                 } ;  
             }  
         }  
  
         r e s . s t a t u s ( S t a t u s C o d e s . O K ) . j s o n ( {  
             m e t r i c s ,  
             n o t e :   " T i m e   a c c u r a c y   o n l y   a v a i l a b l e   f o r   r i d e s   c r e a t e d   w i t h   a p p   v 1 . 0 . 3 + "  
         } ) ;  
     }   c a t c h   ( e r r o r )   {  
         c o n s o l e . e r r o r ( ' E r r o r   c a l c u l a t i n g   a c c u r a c y   m e t r i c s : ' ,   e r r o r ) ;  
         r e s . s t a t u s ( S t a t u s C o d e s . I N T E R N A L _ S E R V E R _ E R R O R ) . j s o n ( {  
             m e s s a g e :   ' F a i l e d   t o   c a l c u l a t e   a c c u r a c y   m e t r i c s ' ,  
             e r r o r :   e r r o r . m e s s a g e  
         } ) ;  
     }  
 } ;  
 