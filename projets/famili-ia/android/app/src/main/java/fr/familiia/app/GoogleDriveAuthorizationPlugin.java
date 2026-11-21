package fr.familiia.app;

import android.app.Activity;
import android.content.Intent;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "GoogleDriveAuthorization")
public class GoogleDriveAuthorizationPlugin extends Plugin {
    @PluginMethod
    public void authorize(PluginCall call) {
        String scope = call.getString("scope");
        if (!"https://www.googleapis.com/auth/drive.readonly".equals(scope)) {
            call.reject("Périmètre Google Drive non autorisé.");
            return;
        }
        Intent intent = new Intent(getContext(), GoogleDriveAuthorizationActivity.class);
        intent.putExtra("scope", scope);
        startActivityForResult(call, intent, "handleAuthorizationResult");
    }

    @ActivityCallback
    public void handleAuthorizationResult(PluginCall call, ActivityResult result) {
        if (result.getResultCode() == Activity.RESULT_CANCELED) {
            JSObject cancelled = new JSObject();
            cancelled.put("cancelled", true);
            call.resolve(cancelled);
            return;
        }
        Intent data = result.getData();
        if (data == null) {
            call.reject("Réponse Google vide.");
            return;
        }
        String error = data.getStringExtra("error");
        if (error != null) {
            call.reject(error);
            return;
        }
        String token = data.getStringExtra("accessToken");
        if (token == null || token.isEmpty()) {
            call.reject("Google n'a pas fourni de jeton d'accès.");
            return;
        }
        JSObject response = new JSObject();
        response.put("accessToken", token);
        response.put("grantedScopes", JSArray.from(data.getStringArrayListExtra("grantedScopes")));
        call.resolve(response);
    }
}
