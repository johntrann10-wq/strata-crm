import type { GadgetPermissions } from "gadget-server";

/**
 * This metadata describes the access control configuration available in your application.
 * Grants that are not defined here are set to false by default.
 *
 * View and edit your roles and permissions in the Gadget editor at https://strata.gadget.app/edit/settings/permissions
 */
export const permissions: GadgetPermissions = {
  type: "gadget/permissions/v1",
  roles: {
    "signed-in": {
      storageKey: "signed-in",
      default: {
        read: true,
      },
      models: {
        activityLog: {
          read: {
            filter:
              "accessControl/filters/activityLog/signed-in-read.gelly",
          },
          actions: {
            create: true,
            delete: true,
            update: true,
          },
        },
        appointment: {
          read: {
            filter:
              "accessControl/filters/appointment/signed-in-read.gelly",
          },
          actions: {
            cancel: true,
            complete: true,
            confirm: true,
            create: true,
            delete: {
              filter:
                "accessControl/filters/appointment/signed-in-read.gelly",
            },
            resendReviewRequest: {
              filter:
                "accessControl/filters/appointment/signed-in-read.gelly",
            },
            update: {
              filter:
                "accessControl/filters/appointment/signed-in-update.gelly",
            },
            updateStatus: true,
          },
        },
        appointmentPhoto: {
          read: {
            filter:
              "accessControl/filters/appointmentPhoto/signed-in-read.gelly",
          },
          actions: {
            create: {
              filter:
                "accessControl/filters/appointmentPhoto/signed-in-read.gelly",
            },
            delete: {
              filter:
                "accessControl/filters/appointmentPhoto/signed-in-read.gelly",
            },
            update: true,
          },
        },
        appointmentService: {
          read: {
            filter:
              "accessControl/filters/appointmentService/signed-in-read.gelly",
          },
          actions: {
            create: true,
            delete: {
              filter:
                "accessControl/filters/appointmentService/signed-in-read.gelly",
            },
            update: {
              filter:
                "accessControl/filters/appointmentService/signed-in-read.gelly",
            },
          },
        },
        automationLog: {
          read: {
            filter:
              "accessControl/filters/automationLog/signed-in-read.gelly",
          },
          actions: {
            create: true,
            delete: {
              filter:
                "accessControl/filters/automationLog/signed-in-read.gelly",
            },
            update: true,
          },
        },
        automationRule: {
          read: {
            filter:
              "accessControl/filters/automationRule/signed-in-read.gelly",
          },
          actions: {
            create: true,
            delete: true,
            update: true,
          },
        },
        backupSnapshot: {
          read: {
            filter:
              "accessControl/filters/backupSnapshot/signed-in-read.gelly",
          },
          actions: {
            create: true,
            delete: true,
            update: true,
          },
        },
        business: {
          read: {
            filter:
              "accessControl/filters/business/signed-in-read.gelly",
          },
          actions: {
            completeOnboarding: true,
            create: true,
            delete: true,
            update: {
              filter:
                "accessControl/filters/business/signed-in-read.gelly",
            },
          },
        },
        client: {
          read: {
            filter:
              "accessControl/filters/client/signed-in-read.gelly",
          },
          actions: {
            create: true,
            delete: {
              filter:
                "accessControl/filters/client/signed-in-delete.gelly",
            },
            update: {
              filter:
                "accessControl/filters/client/signed-in-read.gelly",
            },
          },
        },
        inventoryItem: {
          read: {
            filter:
              "accessControl/filters/inventoryItem/signed-in-read.gelly",
          },
          actions: {
            adjustQuantity: true,
            create: true,
            delete: {
              filter:
                "accessControl/filters/inventoryItem/signed-in-read.gelly",
            },
            update: {
              filter:
                "accessControl/filters/inventoryItem/signed-in-update.gelly",
            },
          },
        },
        invoice: {
          read: {
            filter:
              "accessControl/filters/invoice/signed-in-read.gelly",
          },
          actions: {
            applyDiscount: {
              filter:
                "accessControl/filters/invoice/signed-in-applyDiscount.gelly",
            },
            applyTaxRate: {
              filter:
                "accessControl/filters/invoice/signed-in-applyTaxRate.gelly",
            },
            create: true,
            delete: true,
            sendToClient: {
              filter:
                "accessControl/filters/invoice/signed-in-sendToClient.gelly",
            },
            update: {
              filter:
                "accessControl/filters/invoice/signed-in-update.gelly",
            },
            voidInvoice: {
              filter:
                "accessControl/filters/invoice/signed-in-voidInvoice.gelly",
            },
          },
        },
        invoiceLineItem: {
          read: {
            filter:
              "accessControl/filters/invoiceLineItem/signed-in-read.gelly",
          },
          actions: {
            create: true,
            delete: {
              filter:
                "accessControl/filters/invoiceLineItem/signed-in-delete.gelly",
            },
            update: {
              filter:
                "accessControl/filters/invoiceLineItem/signed-in-update.gelly",
            },
          },
        },
        location: {
          read: {
            filter:
              "accessControl/filters/location/signed-in-read.gelly",
          },
          actions: {
            create: true,
            delete: true,
            update: true,
          },
        },
        maintenanceReminder: {
          read: {
            filter:
              "accessControl/filters/maintenanceReminder/signed-in-read.gelly",
          },
          actions: {
            create: true,
            delete: {
              filter:
                "accessControl/filters/maintenanceReminder/signed-in-delete.gelly",
            },
            send: {
              filter:
                "accessControl/filters/maintenanceReminder/signed-in-send.gelly",
            },
            update: {
              filter:
                "accessControl/filters/maintenanceReminder/signed-in-update.gelly",
            },
          },
        },
        notificationLog: {
          read: {
            filter:
              "accessControl/filters/notificationLog/signed-in-read.gelly",
          },
          actions: {
            create: true,
            delete: {
              filter:
                "accessControl/filters/notificationLog/signed-in-read.gelly",
            },
            update: true,
          },
        },
        payment: {
          read: {
            filter:
              "accessControl/filters/payment/signed-in-read.gelly",
          },
          actions: {
            create: true,
            delete: {
              filter:
                "accessControl/filters/payment/signed-in-read.gelly",
            },
            reversePayment: true,
            update: {
              filter:
                "accessControl/filters/payment/signed-in-update.gelly",
            },
          },
        },
        promoCode: {
          read: {
            filter:
              "accessControl/filters/promoCode/signed-in-read.gelly",
          },
          actions: {
            apply: true,
            create: true,
            delete: {
              filter:
                "accessControl/filters/promoCode/signed-in-read.gelly",
            },
            update: {
              filter:
                "accessControl/filters/promoCode/signed-in-update.gelly",
            },
          },
        },
        quote: {
          read: {
            filter:
              "accessControl/filters/quote/signed-in-read.gelly",
          },
          actions: {
            create: true,
            delete: true,
            send: true,
            sendFollowUp: {
              filter:
                "accessControl/filters/quote/signed-in-read.gelly",
            },
            update: true,
          },
        },
        quoteLineItem: {
          read: {
            filter:
              "accessControl/filters/quoteLineItem/signed-in-read.gelly",
          },
          actions: {
            create: {
              filter:
                "accessControl/filters/quoteLineItem/signed-in-read.gelly",
            },
            delete: {
              filter:
                "accessControl/filters/quoteLineItem/signed-in-read.gelly",
            },
            update: {
              filter:
                "accessControl/filters/quoteLineItem/signed-in-read.gelly",
            },
          },
        },
        service: {
          read: {
            filter:
              "accessControl/filters/service/signed-in-read.gelly",
          },
          actions: {
            activate: true,
            create: true,
            deactivate: true,
            delete: {
              filter:
                "accessControl/filters/service/signed-in-delete.gelly",
            },
            update: {
              filter:
                "accessControl/filters/service/signed-in-update.gelly",
            },
          },
        },
        serviceInventoryItem: {
          read: {
            filter:
              "accessControl/filters/serviceInventoryItem/signed-in-read.gelly",
          },
          actions: {
            create: true,
            delete: true,
            update: true,
          },
        },
        staff: {
          read: {
            filter:
              "accessControl/filters/staff/signed-in-read.gelly",
          },
          actions: {
            create: true,
            deactivate: true,
            delete: {
              filter:
                "accessControl/filters/staff/signed-in-read.gelly",
            },
            update: {
              filter:
                "accessControl/filters/staff/signed-in-update.gelly",
            },
          },
        },
        systemErrorLog: {
          read: {
            filter:
              "accessControl/filters/systemErrorLog/signed-in-read.gelly",
          },
          actions: {
            create: true,
            delete: {
              filter:
                "accessControl/filters/systemErrorLog/signed-in-read.gelly",
            },
            update: true,
          },
        },
        user: {
          read: {
            filter: "accessControl/filters/user/tenant.gelly",
          },
          actions: {
            changePassword: {
              filter: "accessControl/filters/user/tenant.gelly",
            },
            signOut: {
              filter: "accessControl/filters/user/tenant.gelly",
            },
            update: {
              filter: "accessControl/filters/user/tenant.gelly",
            },
          },
        },
        vehicle: {
          read: {
            filter:
              "accessControl/filters/vehicle/signed-in-read.gelly",
          },
          actions: {
            create: true,
            delete: {
              filter:
                "accessControl/filters/vehicle/signed-in-read.gelly",
            },
            update: {
              filter:
                "accessControl/filters/vehicle/signed-in-read.gelly",
            },
          },
        },
        vehicleInspection: {
          read: {
            filter:
              "accessControl/filters/vehicleInspection/signed-in-read.gelly",
          },
          actions: {
            create: {
              filter:
                "accessControl/filters/vehicleInspection/signed-in-read.gelly",
            },
            delete: true,
            update: {
              filter:
                "accessControl/filters/vehicleInspection/signed-in-read.gelly",
            },
          },
        },
      },
      actions: {
        checkAvailability: true,
        checkLowStockAlerts: true,
        detectLapsedClients: true,
        estimateDuration: true,
        generatePortalToken: true,
        getAnalyticsData: true,
        getAutomationRules: true,
        getCapacityInsights: true,
        getDashboardStats: true,
        getInvoiceMetrics: true,
        getSystemHealth: true,
        getUpsellRecommendations: true,
        markErrorResolved: true,
        migrateBusinessTypes: true,
        optimizeDailyRoute: true,
        restoreClient: true,
        restoreService: true,
        restoreVehicle: true,
        reversePayment: true,
        runAutomations: true,
        saveAutomationRule: true,
        sendLapsedClientOutreach: true,
        unvoidInvoice: true,
      },
    },
    unauthenticated: {
      storageKey: "unauthenticated",
      models: {
        user: {
          actions: {
            resetPassword: true,
            sendResetPassword: true,
            sendVerifyEmail: true,
            signIn: true,
            signUp: true,
            verifyEmail: true,
          },
        },
      },
      actions: {
        acceptQuote: true,
      },
    },
    manager: {
      storageKey: "manager",
      models: {
        appointment: {
          read: {
            filter:
              "accessControl/filters/appointment/manager-read.gelly",
          },
          actions: {
            cancel: {
              filter:
                "accessControl/filters/appointment/manager-read.gelly",
            },
            complete: {
              filter:
                "accessControl/filters/appointment/manager-read.gelly",
            },
            confirm: {
              filter:
                "accessControl/filters/appointment/manager-read.gelly",
            },
            create: true,
            resendReviewRequest: {
              filter:
                "accessControl/filters/appointment/manager-read.gelly",
            },
            update: {
              filter:
                "accessControl/filters/appointment/manager-read.gelly",
            },
            updateStatus: {
              filter:
                "accessControl/filters/appointment/manager-read.gelly",
            },
          },
        },
        appointmentPhoto: {
          read: {
            filter:
              "accessControl/filters/appointmentPhoto/signed-in-read.gelly",
          },
          actions: {
            create: {
              filter:
                "accessControl/filters/appointmentPhoto/signed-in-read.gelly",
            },
            delete: {
              filter:
                "accessControl/filters/appointmentPhoto/signed-in-read.gelly",
            },
            update: true,
          },
        },
        appointmentService: {
          read: {
            filter:
              "accessControl/filters/appointmentService/signed-in-read.gelly",
          },
          actions: {
            create: true,
            delete: {
              filter:
                "accessControl/filters/appointmentService/signed-in-read.gelly",
            },
            update: {
              filter:
                "accessControl/filters/appointmentService/signed-in-read.gelly",
            },
          },
        },
        business: {
          read: {
            filter:
              "accessControl/filters/business/manager-read.gelly",
          },
        },
        client: {
          read: {
            filter: "accessControl/filters/client/manager-read.gelly",
          },
          actions: {
            create: true,
            update: {
              filter:
                "accessControl/filters/client/manager-read.gelly",
            },
          },
        },
        inventoryItem: {
          read: {
            filter:
              "accessControl/filters/inventoryItem/manager-read.gelly",
          },
          actions: {
            adjustQuantity: true,
          },
        },
        invoice: {
          read: {
            filter:
              "accessControl/filters/invoice/manager-read.gelly",
          },
        },
        invoiceLineItem: {
          read: {
            filter:
              "accessControl/filters/invoiceLineItem/manager-read.gelly",
          },
        },
        location: {
          read: {
            filter:
              "accessControl/filters/location/manager-read.gelly",
          },
        },
        maintenanceReminder: {
          read: {
            filter:
              "accessControl/filters/maintenanceReminder/manager-read.gelly",
          },
        },
        payment: {
          read: {
            filter:
              "accessControl/filters/payment/manager-read.gelly",
          },
        },
        quote: {
          read: {
            filter: "accessControl/filters/quote/manager-read.gelly",
          },
        },
        service: {
          read: {
            filter:
              "accessControl/filters/service/manager-read.gelly",
          },
        },
        serviceInventoryItem: {
          read: {
            filter:
              "accessControl/filters/serviceInventoryItem/signed-in-read.gelly",
          },
        },
        staff: {
          read: {
            filter: "accessControl/filters/staff/manager-read.gelly",
          },
        },
        systemErrorLog: {
          read: {
            filter:
              "accessControl/filters/systemErrorLog/manager-read.gelly",
          },
          actions: {
            create: true,
            delete: {
              filter:
                "accessControl/filters/systemErrorLog/signed-in-read.gelly",
            },
            update: true,
          },
        },
        vehicle: {
          read: {
            filter:
              "accessControl/filters/vehicle/manager-read.gelly",
          },
          actions: {
            create: true,
            update: {
              filter:
                "accessControl/filters/vehicle/manager-read.gelly",
            },
          },
        },
        vehicleInspection: {
          read: {
            filter:
              "accessControl/filters/vehicleInspection/signed-in-read.gelly",
          },
          actions: {
            create: {
              filter:
                "accessControl/filters/vehicleInspection/signed-in-read.gelly",
            },
            update: {
              filter:
                "accessControl/filters/vehicleInspection/signed-in-read.gelly",
            },
          },
        },
      },
      actions: {
        checkAvailability: true,
        estimateDuration: true,
        getCapacityInsights: true,
        getDashboardStats: true,
        getUpsellRecommendations: true,
        optimizeDailyRoute: true,
      },
    },
    "staff-member": {
      storageKey: "staff-member",
      models: {
        appointment: {
          read: {
            filter:
              "accessControl/filters/appointment/staff-member-read.gelly",
          },
          actions: {
            complete: {
              filter:
                "accessControl/filters/appointment/staff-member-read.gelly",
            },
            update: {
              filter:
                "accessControl/filters/appointment/staff-member-update.gelly",
            },
            updateStatus: {
              filter:
                "accessControl/filters/appointment/staff-member-read.gelly",
            },
          },
        },
        appointmentPhoto: {
          read: {
            filter:
              "accessControl/filters/appointmentPhoto/staff-member-read.gelly",
          },
          actions: {
            create: {
              filter:
                "accessControl/filters/appointmentPhoto/staff-member-read.gelly",
            },
            delete: {
              filter:
                "accessControl/filters/appointmentPhoto/staff-member-read.gelly",
            },
            update: true,
          },
        },
        appointmentService: {
          read: {
            filter:
              "accessControl/filters/appointmentService/staff-member-read.gelly",
          },
        },
        business: {
          read: {
            filter:
              "accessControl/filters/business/staff-member-read.gelly",
          },
        },
        client: {
          read: {
            filter:
              "accessControl/filters/client/staff-member-read.gelly",
          },
        },
        inventoryItem: {
          read: {
            filter:
              "accessControl/filters/inventoryItem/staff-member-read.gelly",
          },
        },
        location: {
          read: {
            filter:
              "accessControl/filters/location/staff-member-read.gelly",
          },
        },
        service: {
          read: {
            filter:
              "accessControl/filters/service/staff-member-read.gelly",
          },
        },
        serviceInventoryItem: {
          read: {
            filter:
              "accessControl/filters/serviceInventoryItem/signed-in-read.gelly",
          },
        },
        staff: {
          read: {
            filter:
              "accessControl/filters/staff/staff-member-own.gelly",
          },
        },
        vehicle: {
          read: {
            filter:
              "accessControl/filters/vehicle/staff-member-read.gelly",
          },
        },
        vehicleInspection: {
          read: {
            filter:
              "accessControl/filters/vehicleInspection/staff-member-read.gelly",
          },
          actions: {
            create: {
              filter:
                "accessControl/filters/vehicleInspection/staff-member-read.gelly",
            },
            update: {
              filter:
                "accessControl/filters/vehicleInspection/staff-member-read.gelly",
            },
          },
        },
      },
      actions: {
        checkAvailability: true,
        estimateDuration: true,
      },
    },
  },
};
