package fr.familiia.app;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.Scope;
import com.google.android.gms.tasks.Task;

import java.util.Collections;

public class GoogleDriveAuthorizationActivity extends Activity {
    private static final int AUTHORIZATION_REQUEST = 7312;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String scope = getIntent().getStringExtra("scope");
        if (!"https://www.googleapis.com/auth/drive.readonly".equals(scope)) {
            finishWithError("Périmètre Google Drive non autorisé.");
            return;
        }

        AuthorizationRequest request = AuthorizationRequest.builder()
            .setRequestedScopes(Collections.singletonList(new Scope(scope)))
            .build();
        Task<AuthorizationResult> task = Identity.getAuthorizationClient(this).authorize(request);
        task.addOnSuccessListener(this, this::handleAuthorization);
        task.addOnFailureListener(this, error ->
            finishWithError("Autorisation Google impossible : " + error.getMessage())
        );
    }

    private void handleAuthorization(AuthorizationResult result) {
        if (result.hasResolution()) {
            try {
                startIntentSenderForResult(
                    result.getPendingIntent().getIntentSender(),
                    AUTHORIZATION_REQUEST,
                    null,
                    0,
                    0,
                    0
                );
            } catch (Exception error) {
                finishWithError("Impossible d'ouvrir l'autorisation Google : " + error.getMessage());
            }
            return;
        }
        finishWithResult(result);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != AUTHORIZATION_REQUEST) return;
        if (resultCode != RESULT_OK || data == null) {
            setResult(RESULT_CANCELED, new Intent().putExtra("cancelled", true));
            finish();
            return;
        }
        try {
            AuthorizationResult result = Identity.getAuthorizationClient(this)
                .getAuthorizationResultFromIntent(data);
            handleAuthorization(result);
        } catch (Exception error) {
            finishWithError("Google n'a pas confirmé l'autorisation : " + error.getMessage());
        }
    }

    private void finishWithResult(AuthorizationResult result) {
        String token = result.getAccessToken();
        if (token == null || token.isEmpty()) {
            finishWithError("Google n'a pas fourni de jeton d'accès.");
            return;
        }
        Intent data = new Intent();
        data.putExtra("accessToken", token);
        data.putStringArrayListExtra("grantedScopes", new java.util.ArrayList<>(result.getGrantedScopes()));
        setResult(RESULT_OK, data);
        finish();
    }

    private void finishWithError(String message) {
        setResult(RESULT_OK, new Intent().putExtra("error", message));
        finish();
    }
}
